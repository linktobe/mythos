/**
 * 数据构建：读取 data/ 下的体系注册表、类别词表与各体系词条，做严格校验，
 * 按体系输出 src/generated/entities/<pantheon>.json 与全站索引。
 *
 * 校验失败 = 构建失败。规则见 README「数据校验」。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { z } from 'zod';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(ROOT, 'src', 'generated');
const PUBLIC = path.join(ROOT, 'public');

const readYaml = (p) => (fs.existsSync(p) ? yaml.load(fs.readFileSync(p, 'utf8')) : null);
const errors = [];
const fail = (msg) => errors.push(msg);

const AXES = ['lineage', 'camp', 'realm'];
const AXIS_LABEL = { lineage: '族', camp: '阵营', realm: '界' };

/* ---------- 全局词表 ---------- */
const categories = readYaml(path.join(DATA, 'categories.yml')) ?? [];
if (!Array.isArray(categories) || !categories.length) fail('categories.yml: 读不到类别词表');
const catById = new Map();
const catByZh = new Map();
for (const c of categories) {
  if (!c?.id || !c?.zh) fail(`categories.yml: 存在缺少 id 或 zh 的条目`);
  else {
    if (catById.has(c.id)) fail(`categories.yml: id 重复 ${c.id}`);
    if (catByZh.has(c.zh)) fail(`categories.yml: zh 重复 ${c.zh}`);
    catById.set(c.id, c);
    catByZh.set(c.zh, c);
  }
}

const adaptationKinds = new Set(
  (readYaml(path.join(DATA, 'adaptation-kinds.yml')) ?? []).map((k) => k.zh)
);

/* ---------- 体系注册表 ---------- */
const pantheonList = readYaml(path.join(DATA, 'pantheons.yml')) ?? [];
if (!Array.isArray(pantheonList) || !pantheonList.length) fail('pantheons.yml: 读不到体系注册表');

const Pantheon = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'id 只能是小写字母、数字、连字符'),
  zh: z.string().min(1),
  en: z.string().min(1),
  status: z.enum(['live', 'planned']),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'accent 必须是 #rrggbb'),
  description: z.string().default(''),
  tier_note: z.record(z.string()).default({}),
  axes: z.array(z.enum(AXES)).min(1),
  relation_kinds: z.array(z.string().min(1)).min(1),
  graph_center: z.string().optional(),
  sections: z
    .array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        desc: z.string().default(''),
        route: z.string(),
        types: z.array(z.string()).default([]),
      })
    )
    .min(1),
  order: z.record(z.array(z.string())).default({}),
});

const pantheons = [];
const pantheonIds = new Set();
for (const raw of pantheonList) {
  const parsed = Pantheon.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      fail(`pantheons.yml${raw?.id ? ` [${raw.id}]` : ''}: ${issue.path.join('.')} — ${issue.message}`);
    }
    continue;
  }
  const p = parsed.data;
  if (pantheonIds.has(p.id)) fail(`pantheons.yml: 体系 id 重复 ${p.id}`);
  pantheonIds.add(p.id);

  // 每个类别都必须先在全局词表登记过
  const enabled = new Set();
  const sectionKeys = new Set();
  const routes = new Set();
  for (const s of p.sections) {
    if (sectionKeys.has(s.key)) fail(`pantheons.yml [${p.id}]: section key 重复 ${s.key}`);
    sectionKeys.add(s.key);
    if (routes.has(s.route)) fail(`pantheons.yml [${p.id}]: section 路由重复 "${s.route}"`);
    routes.add(s.route);
    for (const t of s.types) {
      if (!catByZh.has(t)) {
        fail(`pantheons.yml [${p.id}]: 类别 "${t}" 未在 categories.yml 登记`);
        continue;
      }
      if (enabled.has(t)) fail(`pantheons.yml [${p.id}]: 类别 "${t}" 同时出现在两个 section`);
      enabled.add(t);
    }
  }
  p.enabledTypes = enabled;
  pantheons.push(p);
}

/* ---------- 各体系词条 ---------- */
// 允许简写：`lineage: [aesir]` 等价于 `lineage: [{ id: aesir }]`
const AxisItem = z
  .union([
    z.string(),
    z.object({
      id: z.string(),
      note: z.string().optional(),
      from: z.string().optional(),
      until: z.string().optional(),
    }),
  ])
  .transform((v) => (typeof v === 'string' ? { id: v } : v));

const RefList = z.array(z.string()).min(1, '至少一个引用');
// 节次：{ 来源 id: "3–6" }。只登记能在该篇里核对到出处的段落。
const AtMap = z.record(z.string()).optional();

function makeEntrySchema(p) {
  const identityShape = Object.fromEntries(p.axes.map((axis) => [axis, z.array(AxisItem).default([])]));
  return z
    .object({
      id: z.string().regex(/^[a-z0-9-]+$/, 'id 只能是小写字母、数字、连字符'),
      pantheon: z.string(),
      entity_type: z.string().min(1),
      name: z.string().min(1),
      name_original: z.string().min(1),
      aliases: z.array(z.string()).default([]),
      summary: z.string().min(1),
      role: z.object({ title: z.string().min(2), brief: z.string().min(10) }),
      identity: z.object(identityShape).default({}),
      narrative: z.array(z.object({ text: z.string().min(10), refs: RefList, at: AtMap })).min(1, '叙事至少一段'),
      variants: z.array(z.object({ claim: z.string().min(5), refs: RefList, at: AtMap })).default([]),
      relations: z
        .array(
          z.object({
            target: z.string(),
            kind: z.string().min(1),
            detail: z.string().optional(),
            refs: RefList,
          })
        )
        .default([]),
      legacy: z.array(z.string()).default([]),
      profiles: z
        .array(
          z.object({
            name: z.string().min(1),
            name_original: z.string().min(1),
            story: z.string().min(20),
            refs: RefList,
          })
        )
        .default([]),
      // 亲属：只写没有独立词条的家人，避免为一两个名字撑起空页面。
      // 日后若立条，填上 target 即可变成站内链接。
      kinship: z
        .array(
          z.object({
            relation: z.string().min(1),
            name: z.string().min(1),
            name_original: z.string().min(1),
            note: z.string().optional(),
            target: z.string().optional(),
            refs: RefList,
          })
        )
        .default([]),
      weapons: z
        .array(
          z.object({
            name: z.string().min(1),
            name_original: z.string().min(1),
            note: z.string().min(6),
            refs: RefList,
          })
        )
        .default([]),
      adaptations: z
        .array(
          z.object({
            work: z.string().min(4),
            kind: z.string().min(1),
            portrayal: z.string().min(10),
            divergences: z.array(z.string().min(6)).min(1),
          })
        )
        .default([]),
    })
    .superRefine((e, ctx) => {
      const cat = catByZh.get(e.entity_type);
      if (cat && cat.axes === false) return;
      for (const axis of p.axes) {
        if (!e.identity[axis]?.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['identity', axis],
            message: `身份「${AXIS_LABEL[axis]}」不能为空（本体系启用了该轴）`,
          });
        }
      }
    });
}

const SYMMETRIC = new Set(['亲缘', '血盟', '婚姻', '敌对', '宿命', '同源', '等同', '对应']);

const systems = [];
const searchIndex = [];
const totals = { entries: 0, relations: 0, sources: 0 };

for (const p of pantheons) {
  if (p.status !== 'live') continue;
  const dir = path.join(DATA, p.id);

  /* 词表 */
  const vocab = {};
  const vocabIndex = {};
  const abstractIds = new Set();
  for (const axis of p.axes) {
    const rel = path.join('vocab', `${axis}s.yml`);
    const file = path.join(dir, rel);
    if (!fs.existsSync(file)) {
      fail(`${p.id}/${rel}: 体系启用了 ${axis} 轴，但词表文件不存在`);
      vocab[axis] = [];
      vocabIndex[axis] = new Map();
      continue;
    }
    const list = readYaml(file) ?? [];
    const ids = new Set();
    for (const item of list) {
      if (!item?.id) fail(`${p.id}/${rel}: 存在缺少 id 的条目`);
      else if (ids.has(item.id)) fail(`${p.id}/${rel}: id 重复 ${item.id}`);
      else ids.add(item.id);
      if (!item?.zh) fail(`${p.id}/${rel}: ${item?.id} 缺少 zh`);
      if (item?.pantheon && item.pantheon !== p.id) {
        fail(`${p.id}/${rel}: ${item.id} 的 pantheon 是 ${item.pantheon}，与所在目录不符`);
      }
    }
    // 父项引用校验 + abstract 节点不可被词条引用
    for (const item of list) {
      if (item?.parent && !ids.has(item.parent)) {
        fail(`${p.id}/${rel}: ${item.id} 的 parent "${item.parent}" 不存在`);
      }
    }
    for (const item of list) {
      if (item?.abstract) abstractIds.add(item.id);
    }
    vocab[axis] = list;
    vocabIndex[axis] = new Map(list.map((x) => [x.id, x]));
  }

  /* 来源 */
  const sources = readYaml(path.join(dir, 'sources.yml')) ?? [];
  const sourceIndex = new Map();
  for (const s of sources) {
    if (!s?.id) fail(`${p.id}/sources.yml: 存在缺少 id 的条目`);
    else if (sourceIndex.has(s.id)) fail(`${p.id}/sources.yml: id 重复 ${s.id}`);
    else sourceIndex.set(s.id, s);
    if (!['T0', 'T1', 'T2', 'T3'].includes(s?.tier)) fail(`${p.id}/sources.yml: ${s?.id} 的 tier 非法`);
    if (!s?.pantheon) fail(`${p.id}/sources.yml: ${s?.id} 缺少 pantheon`);
    else if (s.pantheon !== p.id) fail(`${p.id}/sources.yml: ${s.id} 的 pantheon 是 ${s.pantheon}，与所在目录不符`);
  }

  /* 词条 */
  const entriesDir = path.join(dir, 'entries');
  const files = fs.existsSync(entriesDir)
    ? fs.readdirSync(entriesDir).filter((f) => f.endsWith('.yml')).sort()
    : [];
  const Entry = makeEntrySchema(p);
  const entries = [];
  const seen = new Set();

  for (const file of files) {
    const raw = readYaml(path.join(entriesDir, file));
    const parsed = Entry.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        fail(`${p.id}/${file}: ${issue.path.join('.')} — ${issue.message}`);
      }
      continue;
    }
    const e = parsed.data;
    const stem = file.replace(/\.yml$/, '');
    if (e.id !== stem) fail(`${p.id}/${file}: id "${e.id}" 与文件名不一致`);
    if (seen.has(e.id)) fail(`${p.id}/${file}: id 重复 ${e.id}`);
    seen.add(e.id);
    if (e.pantheon !== p.id) fail(`${p.id}/${file}: pantheon 字段是 "${e.pantheon}"，与所在目录不符`);
    if (!p.enabledTypes.has(e.entity_type)) {
      const known = catByZh.has(e.entity_type);
      fail(
        `${p.id}/${file}: 类别 "${e.entity_type}" ${known ? '未在本体系启用' : '未在 categories.yml 登记'}`
      );
    }
    for (const a of e.adaptations) {
      if (!adaptationKinds.has(a.kind)) fail(`${p.id}/${file}: 改编体裁 "${a.kind}" 未在 adaptation-kinds.yml 登记`);
    }
    for (const r of e.relations) {
      if (!p.relation_kinds.includes(r.kind)) {
        fail(`${p.id}/${file}: 关系类型 "${r.kind}" 未在本体系 relation_kinds 中启用`);
      }
    }
    entries.push({ ...e, file });
  }

  /* 引用与关系校验（同体系内） */
  const entryIds = new Set(entries.map((e) => e.id));
  const checkRefs = (where, refs) => {
    for (const r of refs) {
      const s = sourceIndex.get(r);
      if (!s) {
        fail(`${where}: 引用了本体系不存在的来源 ${r}`);
        continue;
      }
      if (s.tier === 'T2' || s.tier === 'T3') fail(`${where}: 叙事引用必须是 T0/T1，${r} 是 ${s.tier}`);
    }
  };
  for (const e of entries) {
    for (const [axis, items] of Object.entries(e.identity)) {
      for (const item of items) {
        if (!vocabIndex[axis]?.has(item.id)) {
          fail(`${p.id}/${e.id}: identity.${axis} 引用了词表中不存在的 id "${item.id}"`);
        } else if (axis === 'lineage' && abstractIds.has(item.id)) {
          fail(`${p.id}/${e.id}: identity.lineage 不能引用归类节点 "${item.id}"（abstract）`);
        }
      }
    }
    const checkAt = (where, n) => {
      if (!n.at) return;
      for (const k of Object.keys(n.at)) {
        if (!n.refs.includes(k)) fail(`${where}: at 里的「${k}」不在 refs 中`);
      }
    };
    e.narrative.forEach((n, i) => {
      checkRefs(`${p.id}/${e.id}: narrative[${i}]`, n.refs);
      checkAt(`${p.id}/${e.id}: narrative[${i}]`, n);
    });
    e.variants.forEach((n, i) => {
      checkRefs(`${p.id}/${e.id}: variants[${i}]`, n.refs);
      checkAt(`${p.id}/${e.id}: variants[${i}]`, n);
    });
    e.profiles.forEach((n, i) => checkRefs(`${p.id}/${e.id}: profiles[${i}]`, n.refs));
    e.weapons.forEach((n, i) => checkRefs(`${p.id}/${e.id}: weapons[${i}]`, n.refs));
    e.kinship.forEach((k, i) => {
      checkRefs(`${p.id}/${e.id}: kinship[${i}]`, k.refs);
      if (k.target && !entryIds.has(k.target)) {
        fail(`${p.id}/${e.id}: kinship[${i}] 的 target "${k.target}" 不存在`);
      }
    });
    for (const r of e.relations) {
      if (!entryIds.has(r.target)) fail(`${p.id}/${e.id}: relation target "${r.target}" 不存在`);
      if (r.target === e.id) fail(`${p.id}/${e.id}: 不能指向自己`);
      checkRefs(`${p.id}/${e.id}: relations -> ${r.target}`, r.refs);
    }
  }

  /* 对称关系去重（键含体系） */
  const pairSeen = new Set();
  for (const e of entries) {
    e.relations = e.relations.filter((r) => {
      if (!SYMMETRIC.has(r.kind)) return true;
      const key = `${p.id}|${[e.id, r.target].sort().join('|')}|${r.kind}`;
      if (pairSeen.has(key)) return false;
      pairSeen.add(key);
      return true;
    });
  }

  /* 反向关系 */
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const e of entries) e.related = [];
  for (const e of entries) {
    for (const r of e.relations) {
      const other = byId.get(r.target);
      if (other) {
        other.related.push({ target: e.id, kind: r.kind, detail: r.detail ?? '', refs: r.refs, reverse: true });
      }
    }
  }

  /* 排序用的固定顺序：order.realms / order.events 等按 section key 匹配 */
  for (const e of entries) {
    e.section = p.sections.find((s) => s.types.includes(e.entity_type))?.key ?? null;
  }

  const counts = {
    entries: entries.length,
    relations: entries.reduce((n, e) => n + e.relations.length, 0),
    sources: sources.length,
  };

  systems.push({ pantheon: p, vocab, sources, entries, counts });
  totals.entries += counts.entries;
  totals.relations += counts.relations;
  totals.sources += counts.sources;

  for (const e of entries) {
    searchIndex.push({
      id: e.id,
      pantheon: p.id,
      pantheon_zh: p.zh,
      name: e.name,
      name_original: e.name_original,
      aliases: e.aliases,
      entity_type: e.entity_type,
      url: `/${p.id}/entry/${e.id}/`,
    });
  }
}

if (errors.length) {
  console.error('\n✗ 数据校验失败：');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

/* ---------- 输出 ---------- */
fs.mkdirSync(path.join(OUT, 'entities'), { recursive: true });
fs.rmSync(path.join(OUT, 'entities'), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'entities'), { recursive: true });

for (const { pantheon: p, vocab, sources, entries, counts } of systems) {
  const payload = {
    generatedAt: new Date().toISOString(),
    pantheon: {
      id: p.id,
      zh: p.zh,
      en: p.en,
      accent: p.accent,
      description: p.description,
      tier_note: p.tier_note,
      axes: p.axes,
      relation_kinds: p.relation_kinds,
      graph_center: p.graph_center ?? null,
      sections: p.sections,
      order: p.order,
    },
    counts,
    vocab,
    sources,
    entries,
    byId: Object.fromEntries(entries.map((e) => [e.id, { name: e.name, entity_type: e.entity_type, section: e.section }])),
  };
  fs.writeFileSync(path.join(OUT, 'entities', `${p.id}.json`), JSON.stringify(payload, null, 1), 'utf8');
}

const pantheonsOut = {
  generatedAt: new Date().toISOString(),
  totals,
  pantheons: pantheons.map((p) => ({
    id: p.id,
    zh: p.zh,
    en: p.en,
    status: p.status,
    accent: p.accent,
    description: p.description,
    tier_note: p.tier_note,
    sections: p.sections,
    axes: p.axes,
    graph_center: p.graph_center ?? null,
    counts: systems.find((s) => s.pantheon.id === p.id)?.counts ?? {
      entries: 0,
      relations: 0,
      sources: 0,
    },
  })),
};
fs.writeFileSync(path.join(OUT, 'pantheons.json'), JSON.stringify(pantheonsOut, null, 1), 'utf8');
// 搜索索引要能被浏览器直接取到，所以落在 public/ 下（构建前生成，不进 git）
fs.mkdirSync(PUBLIC, { recursive: true });
fs.writeFileSync(path.join(PUBLIC, 'search-index.json'), JSON.stringify(searchIndex, null, 0), 'utf8');

for (const { pantheon: p, counts } of systems) {
  console.log(`✓ ${p.zh}: ${counts.entries} 条 / ${counts.relations} 关系 / ${counts.sources} 种典籍`);
}
console.log(`  合计 ${totals.entries} 条词目、${totals.relations} 条关系、${totals.sources} 种典籍，${systems.length} 套体系上线`);
