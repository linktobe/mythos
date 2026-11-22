/**
 * 预计算关系图布局。
 * 在 Node 里跑一次 d3-force，把坐标算死后写进 graph.json，
 * 页面只渲染 SVG —— 首屏不抖、爬虫可读、运行时零依赖。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src', 'generated', 'entities.json');
const OUT = path.join(ROOT, 'src', 'generated', 'graph.json');

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const W = 900;
const H = 620;

const degree = new Map();
for (const e of data.entries) {
  for (const r of e.relations) {
    degree.set(e.id, (degree.get(e.id) ?? 0) + 1);
    degree.set(r.target, (degree.get(r.target) ?? 0) + 1);
  }
}

// 确定性初始布局（圆周），保证每次构建出的图一致
const n = data.entries.length;
const nodes = data.entries.map((e, i) => {
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
for (const e of data.entries) {
  for (const r of e.relations) {
    links.push({ source: e.id, target: r.target, kind: r.kind });
  }
}

const sim = forceSimulation(nodes)
  .force('link', forceLink(links).id((d) => d.id).distance(110).strength(0.7))
  .force('charge', forceManyBody().strength(-420))
  .force('center', forceCenter(W / 2, H / 2))
  .force('collide', forceCollide().radius((d) => d.r + 18))
  .stop();

for (let i = 0; i < 400; i += 1) sim.tick();

// 归一化到画布内并留边
const pad = 40;
const xs = nodes.map((d) => d.x);
const ys = nodes.map((d) => d.y);
const minX = Math.min(...xs), maxX = Math.max(...xs);
const minY = Math.min(...ys), maxY = Math.max(...ys);
const sx = (W - pad * 2) / Math.max(1, maxX - minX);
const sy = (H - pad * 2) / Math.max(1, maxY - minY);
const s = Math.min(sx, sy, 1.6);

for (const d of nodes) {
  d.x = Math.round((d.x - minX) * s + pad);
  d.y = Math.round((d.y - minY) * s + pad);
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
