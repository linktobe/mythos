/**
 * 预计算关系图布局（按体系各算一张）。
 * 在 Node 里跑 d3-force，把坐标算死后写进 graph/<pantheon>.json，
 * 页面只渲染 SVG —— 首屏不抖、爬虫可读、运行时零依赖。
 *
 * 只画人物类（categories.yml 里 graph: true 的类别）。
 * 中心节点取自 pantheons.yml 的 graph_center，缺省时退到连接最多的一人。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceRadial } from 'd3-force';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN = path.join(ROOT, 'src', 'generated');
const OUT = path.join(GEN, 'graph');

const registry = JSON.parse(fs.readFileSync(path.join(GEN, 'pantheons.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

const BASE_W = 1080;
const BASE_N = 26; // 北欧当前的规模：以此为准，节点多则整体放大画布

let total = 0;

for (const p of registry.pantheons) {
  if (p.status !== 'live') continue;
  const file = path.join(GEN, 'entities', `${p.id}.json`);
  if (!fs.existsSync(file)) continue;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));

  const entries = data.entries.filter((e) => e.graph === true);
  if (!entries.length) {
    console.log(`- ${p.zh}: 无关系图节点，跳过`);
    continue;
  }
  const allowed = new Set(entries.map((e) => e.id));

  const degree = new Map();
  for (const e of entries) {
    for (const r of e.relations) {
      if (!allowed.has(r.target)) continue;
      degree.set(e.id, (degree.get(e.id) ?? 0) + 1);
      degree.set(r.target, (degree.get(r.target) ?? 0) + 1);
    }
  }

  // 画布按节点数等比放大，避免大体系挤成一团
  const scale = Math.max(1, Math.sqrt(entries.length / BASE_N));
  const W = Math.round(BASE_W * scale);
  const H = Math.round(Math.max(760, entries.length * 26));

  // 确定性初始布局（圆周），保证每次构建出的图一致
  const n = entries.length;
  const nodes = entries.map((e, i) => {
    const a = (i / n) * Math.PI * 2;
    return {
      id: e.id,
      name: e.name,
      lineage: e.identity.lineage?.[0]?.id ?? '',
      camp: e.identity.camp?.[0]?.id ?? '',
      degree: degree.get(e.id) ?? 0,
      r: 10 + Math.min(14, (degree.get(e.id) ?? 0) * 2.2),
      x: W / 2 + Math.cos(a) * 220 * scale,
      y: H / 2 + Math.sin(a) * 180 * scale,
    };
  });

  const links = [];
  for (const e of entries) {
    for (const r of e.relations) {
      if (!allowed.has(r.target)) continue;
      links.push({ source: e.id, target: r.target, kind: r.kind });
    }
  }

  // 中心：注册表指定，找不到就取连接最多的节点
  let center = nodes.find((d) => d.id === p.graph_center);
  if (!center) {
    center = [...nodes].sort((a, b) => b.degree - a.degree)[0];
  }

  const neighborIds = new Set();
  for (const l of links) {
    const a = typeof l.source === 'object' ? l.source.id : l.source;
    const b = typeof l.target === 'object' ? l.target.id : l.target;
    if (a === center.id) neighborIds.add(b);
    if (b === center.id) neighborIds.add(a);
  }
  for (const d of nodes) d.ring = neighborIds.has(d.id) ? 0 : 1;

  center.x = W / 2;
  center.y = H / 2;
  center.fx = W / 2;
  center.fy = H / 2;

  const r0 = 250 * scale;
  const r1 = 360 * scale;

  const sim = forceSimulation(nodes)
    // 同心圈布局：中心人物居中，直连者内圈、其余外圈，避免力导向把图拉成一条竖线
    .force('radial', forceRadial((d) => (d.ring === 0 ? r0 : r1), W / 2, H / 2).strength(0.95))
    .force('link', forceLink(links).id((d) => d.id).distance(120 * scale).strength(0.12))
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

  // 缩放后把中心人物挪回正中；位移夹住，保证整张图不越出画布
  const bx = nodes.map((d) => d.x);
  const by = nodes.map((d) => d.y);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const dx = clamp(W / 2 - center.x, pad - Math.min(...bx), W - pad - Math.max(...bx));
  const dy = clamp(H / 2 - center.y, pad - Math.min(...by), H - pad - Math.max(...by));
  for (const d of nodes) {
    d.x = Math.round(d.x + dx);
    d.y = Math.round(d.y + dy);
  }
  center.fx = null;
  center.fy = null;

  const out = {
    pantheon: p.id,
    width: W,
    height: H,
    center: center.id,
    nodes,
    links: links.map((l) => ({
      source: typeof l.source === 'object' ? l.source.id : l.source,
      target: typeof l.target === 'object' ? l.target.id : l.target,
      kind: l.kind,
    })),
  };

  fs.writeFileSync(path.join(OUT, `${p.id}.json`), JSON.stringify(out), 'utf8');
  console.log(`✓ ${p.zh} 关系图：${nodes.length} 节点 / ${links.length} 边，中心 ${center.name}`);
  total += nodes.length;
}

console.log(`  合计 ${total} 个图节点`);
