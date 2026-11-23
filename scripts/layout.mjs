/**
 * 预计算关系图布局。
 * 在 Node 里跑一次 d3-force，把坐标算死后写进 graph.json，
 * 页面只渲染 SVG —— 首屏不抖、爬虫可读、运行时零依赖。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceRadial } from 'd3-force';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src', 'generated', 'entities.json');
const OUT = path.join(ROOT, 'src', 'generated', 'graph.json');

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));

// 关系图只画人物之间的关系；器物、群体、地区、事件不参与，避免图被拉散
const PEOPLE = new Set(['神祇', '巨人', '矮人', '异兽']);
const entries = data.entries.filter((e) => PEOPLE.has(e.entity_type));
const allowed = new Set(entries.map((e) => e.id));
const W = 1080;
const H = 760;

const degree = new Map();
for (const e of entries) {
  for (const r of e.relations) {
    if (!allowed.has(r.target)) continue;
    degree.set(e.id, (degree.get(e.id) ?? 0) + 1);
    degree.set(r.target, (degree.get(r.target) ?? 0) + 1);
  }
}

// 确定性初始布局（圆周），保证每次构建出的图一致
const n = entries.length;
const nodes = entries.map((e, i) => {
  const a = (i / n) * Math.PI * 2;
  return {
    id: e.id,
    name: e.name,
    lineage: e.identity.lineage[0]?.id ?? '',
    camp: e.identity.camp[0]?.id ?? '',
    degree: degree.get(e.id) ?? 0,
    r: 10 + Math.min(14, (degree.get(e.id) ?? 0) * 2.2),
    x: W / 2 + Math.cos(a) * 220,
    y: H / 2 + Math.sin(a) * 180,
  };
});

const links = [];
for (const e of entries) {
  for (const r of e.relations) {
    if (!allowed.has(r.target)) continue;
    links.push({ source: e.id, target: r.target, kind: r.kind });
  }
}

// 以奥丁为锚点：钉在画布中心，直连者在内圈，其余在外圈
const neighborIds = new Set();
for (const l of links) {
  const a = typeof l.source === 'object' ? l.source.id : l.source;
  const b = typeof l.target === 'object' ? l.target.id : l.target;
  if (a === 'odin') neighborIds.add(b);
  if (b === 'odin') neighborIds.add(a);
}
for (const d of nodes) d.ring = neighborIds.has(d.id) ? 0 : 1;

const center = nodes.find((d) => d.id === 'odin');
if (center) {
  center.x = W / 2;
  center.y = H / 2;
  center.fx = W / 2;
  center.fy = H / 2;
}

const sim = forceSimulation(nodes)
  // 同心圈布局：奥丁居中，直连者内圈、其余外圈，避免力导向把图拉成一条竖线
  .force('radial', forceRadial((d) => (d.ring === 0 ? 250 : 360), W / 2, H / 2).strength(0.95))
  .force('link', forceLink(links).id((d) => d.id).distance(120).strength(0.12))
  .force('charge', forceManyBody().strength(-260))
  .force('collide', forceCollide().radius((d) => d.r + 42))
  .stop();

for (let i = 0; i < 700; i += 1) sim.tick();

// 整体等比缩放进画布：不夹边界（夹边界会把节点挤到同一条边上，标签重叠）
const pad = 70;
const xs = nodes.map((d) => d.x);
const ys = nodes.map((d) => d.y);
const minX = Math.min(...xs), maxX = Math.max(...xs);
const minY = Math.min(...ys), maxY = Math.max(...ys);
const s = Math.min((W - pad * 2) / Math.max(1, maxX - minX), (H - pad * 2) / Math.max(1, maxY - minY));

for (const d of nodes) {
  d.x = Math.round((d.x - minX) * s + (W - (maxX - minX) * s) / 2);
  d.y = Math.round((d.y - minY) * s + (H - (maxY - minY) * s) / 2);
}

// 缩放后把奥丁挪回正中；但位移要夹住，保证整张图不越出画布
const odin = nodes.find((d) => d.id === 'odin');
if (odin) {
  const bx = nodes.map((d) => d.x);
  const by = nodes.map((d) => d.y);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const dx = clamp(W / 2 - odin.x, pad - Math.min(...bx), W - pad - Math.max(...bx));
  const dy = clamp(H / 2 - odin.y, pad - Math.min(...by), H - pad - Math.max(...by));
  for (const d of nodes) {
    d.x = Math.round(d.x + dx);
    d.y = Math.round(d.y + dy);
  }
}

const out = {
  width: W,
  height: H,
  nodes,
  links: links.map((l) => ({
    source: typeof l.source === 'object' ? l.source.id : l.source,
    target: typeof l.target === 'object' ? l.target.id : l.target,
    kind: l.kind,
  })),
};

fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');
console.log(`✓ 关系图布局：${nodes.length} 节点 / ${links.length} 边`);
