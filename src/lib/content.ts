/// <reference types="vite/client" />
/**
 * 构建产物（src/generated）的统一入口。
 *
 * 页面只认这里导出的东西，不直接 import JSON，
 * 这样以后加体系只改 data/ 下的 YAML，不动页面代码。
 */

import registry from '../generated/pantheons.json';

/* 数据边界一律当 any 处理：真正的类型校验在 scripts/build-data.mjs 里用 zod 做，
   这里再声明一遍只会带来维护负担。 */
export type AnyRecord = Record<string, any>;

export const pantheons: AnyRecord[] = (registry as AnyRecord).pantheons;
export const totals: AnyRecord = (registry as AnyRecord).totals;

/** 已上线体系（planned 的不进构建、不出路由） */
export const livePantheons: AnyRecord[] = pantheons.filter((p) => p.status === 'live');

const entryModules = import.meta.glob<AnyRecord>('../generated/entities/*.json', {
  eager: true,
  import: 'default',
});

const idOf = (filePath: string) => filePath.split('/').pop()!.replace(/\.json$/, '');

export const systems: Record<string, AnyRecord> = {};
for (const [filePath, mod] of Object.entries(entryModules)) {
  systems[idOf(filePath)] = mod as AnyRecord;
}

export const getSystem = (id: string): AnyRecord | undefined => systems[id];

/** 词条页地址 */
export const entryHref = (pantheonId: string, entryId: string) => `/${pantheonId}/entry/${entryId}/`;

/** 某个体系里的列表页地址；route 为空表示体系首页本身 */
export const sectionHref = (pantheonId: string, route: string) =>
  route ? `/${pantheonId}/${route}/` : `/${pantheonId}/`;

/** 三轴词表里取中文名；取不到时回落 id */
export function tagOf(system: AnyRecord, axis: string, id: string): string {
  return system?.vocab?.[axis]?.find((x: AnyRecord) => x.id === id)?.zh ?? id;
}

/** 某个类别（entity_type）落在哪个 section */
export function sectionKeyOf(system: AnyRecord, entityType: string): string | null {
  return system?.pantheon?.sections?.find((s: AnyRecord) => s.types.includes(entityType))?.key ?? null;
}

/** 一段词条属于哪个列表页（用于返回链接与面包屑） */
export function parentSection(system: AnyRecord, entry: AnyRecord): AnyRecord | null {
  const key = entry.section ?? sectionKeyOf(system, entry.entity_type);
  const section = system?.pantheon?.sections?.find((s: AnyRecord) => s.key === key);
  if (!section) return null;
  return { ...section, href: sectionHref(system.pantheon.id, section.route) };
}
