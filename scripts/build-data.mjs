/**
 * 数据构建：读取 data/ 下的词条与受控词表，做严格校验，输出 src/generated/entities.json
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

const readYaml = (p) => yaml.load(fs.readFileSync(p, 'utf8'));
const errors = [];
const fail = (msg) => errors.push(msg);

/* ---------- 词表 ---------- */
const vocabFiles = {
  lineage: 'vocab/lineages.yml',
  camp: 'vocab/camps.yml',
  realm: 'vocab/realms.yml',
};
const vocab = {};
for (const [axis, rel] of Object.entries(vocabFiles)) {
  const list = readYaml(path.join(DATA, rel));
  if (!Array.isArray(list)) {
    fail(`${rel}: 顶层必须是数组`);
    vocab[axis] = [];
    continue;
  }
  vocab[axis] = list;
  const ids = new Set();
  for (const item of list) {
    if (!item?.id) fail(`${rel}: 存在缺少 id 的条目`);
    else if (ids.has(item.id)) fail(`${rel}: id 重复 ${item.id}`);
    else ids.add(item.id);
    if (!item?.zh) fail(`${rel}: ${item?.id} 缺少 zh`);
  }
}
const vocabIndex = Object.fromEntries(
  Object.entries(vocab).map(([axis, list]) => [axis, new Map(list.map((x) => [x.id, x]))])
);

/* ---------- 来源登记表 ---------- */
const sources = readYaml(path.join(DATA, 'sources.yml')) ?? [];
const sourceIndex = new Map(sources.map((s) => [s.id, s]));
for (const s of sources) {
  if (!['T0', 'T1', 'T2', 'T3'].includes(s.tier)) fail(`sources.yml: ${s.id} 的 tier 非法`);
}

/* ---------- 词条 schema ---------- */
const RefList = z.array(z.string()).min(1, '至少一个引用');

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

const IdentityAxis = z.array(AxisItem).min(1);

const Entry = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'id 只能是小写字母、数字、连字符'),
  pantheon: z.string(),
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  summary: z.string().min(1),
  role: z.object({
    title: z.string().min(2),
    brief: z.string().min(10),
  }),
  identity: z.object({
    lineage: IdentityAxis,
    camp: IdentityAxis,
    realm: IdentityAxis,
  }),
  narrative: z
    .array(z.object({ text: z.string().min(10), refs: RefList }))
    .min(1, '叙事至少一段'),
  variants: z.array(z.object({ claim: z.string().min(5), refs: RefList })).default([]),
  relations: z
    .array(
      z.object({
        target: z.string(),
        kind: z.enum(['亲缘', '血盟', '婚姻', '敌对', '宿命', '从属', '师承', '化生', '同源']),
        detail: z.string().optional(),
        refs: RefList,
      })
    )
    .default([]),
  legacy: z.array(z.string()).default([]),
});

/* ---------- 读取词条 ---------- */
const dir = path.join(DATA, 'shen');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.yml'));
const entries = [];
const seen = new Set();

for (const file of files) {
  const raw = readYaml(path.join(dir, file));
  const parsed = Entry.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      fail(`${file}: ${issue.path.join('.')} — ${issue.message}`);
    }
    continue;
  }
  const e = parsed.data;
  const stem = file.replace(/\.yml$/, '');
  if (e.id !== stem) fail(`${file}: id "${e.id}" 与文件名不一致`);
  if (seen.has(e.id)) fail(`${file}: id 重复 ${e.id}`);
  seen.add(e.id);
  entries.push({ ...e, file });
}

/* ---------- 引用校验 ---------- */
const entryIds = new Set(entries.map((e) => e.id));
const checkRefs = (where, refs) => {
  for (const r of refs) {
    const s = sourceIndex.get(r);
    if (!s) {
      fail(`${where}: 引用了不存在的来源 ${r}`);
      continue;
    }
    if (s.tier === 'T2' || s.tier === 'T3') {
      fail(`${where}: 叙事引用必须是 T0/T1，${r} 是 ${s.tier}`);
    }
  }
};

for (const e of entries) {
  for (const [k, v] of Object.entries(e.identity)) {
    for (const axisItem of v) {
      if (!vocabIndex[k].has(axisItem.id)) {
        fail(`${e.id}: identity.${k} 引用了词表中不存在的 id "${axisItem.id}"`);
      }
    }
  }
  e.narrative.forEach((p, i) => checkRefs(`${e.id}: narrative[${i}]`, p.refs));
  e.variants.forEach((p, i) => checkRefs(`${e.id}: variants[${i}]`, p.refs));
  for (const r of e.relations) {
    if (!entryIds.has(r.target)) fail(`${e.id}: relation target "${r.target}" 不存在`);
    if (r.target === e.id) fail(`${e.id}: 不能指向自己`);
    checkRefs(`${e.id}: relations -> ${r.target}`, r.refs);
  }
}

if (errors.length) {
  console.error('\n✗ 数据校验失败：');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

/* ---------- 对称关系统一方向 ---------- */
// 亲缘/血盟/婚姻/敌对/宿命/同源是双向的：两页各写一遍会导致重复。
// 统一保留 id 字典序较小的一侧，另一侧展示时标记为反向。
const SYMMETRIC = new Set(['亲缘', '血盟', '婚姻', '敌对', '宿命', '同源']);
const pairSeen = new Set();
for (const e of entries) {
  e.relations = e.relations.filter((r) => {
    if (!SYMMETRIC.has(r.kind)) return true;
    const key = [e.id, r.target].sort().join('|') + '|' + r.kind;
    if (pairSeen.has(key)) return false;
    pairSeen.add(key);
    return true;
  });
}

/* ---------- 反向关系 + 输出 ---------- */
const byId = new Map(entries.map((e) => [e.id, e]));
for (const e of entries) {
  e.related = [];
}
for (const e of entries) {
  for (const r of e.relations) {
    const other = byId.get(r.target);
    if (!other) continue;
    other.related.push({ target: e.id, kind: r.kind, detail: r.detail ?? '', refs: r.refs, reverse: true });
  }
}

const payload = {
  generatedAt: new Date().toISOString(),
  counts: { entries: entries.length, sources: sources.length, relations: entries.reduce((n, e) => n + e.relations.length, 0) },
  vocab,
  sources,
  entries,
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'entities.json'), JSON.stringify(payload, null, 1), 'utf8');

console.log(`✓ ${entries.length} 个词条 / ${payload.counts.relations} 条关系 / ${sources.length} 条来源`);
const tier = entries.length ? sources.filter((s) => s.tier === 'T0').length : 0;
console.log(`  T0 原典 ${tier} 种，T1 汇编 ${sources.length - tier} 种`);
