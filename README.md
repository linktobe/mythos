# mythos · 神话人物图鉴（中文）

以 **T0 原典** 为主干的中文神话人物词条库，带结构化关系与三轴身份（阵营 / 界 / 族）。

- 语种：仅中文
- 体裁：纯文本，无图片
- 部署：Cloudflare Pages（纯静态）

## 编例（摘要）

1. 叙事主干只用 T0 原典；T1 仅在 T0 缺失时兜底并标注；T2/T3（后世重述、游戏影视）压缩成一句，放在词条末尾的「后世演绎」。
2. 冲突版本**并列**，不缝合、不裁决。
3. 每条关键断言必须挂到具体来源（`data/sources.yml` 中的 id）。
4. 三类身份拆成三轴：`lineage`（血统/族）、`camp`（阵营/归属）、`realm`（界/居所），可随时间变化。
5. 每个词条须写明其在神话世界中的**角色与责任**（`role.title` / `role.brief`）。

## 目录

```
data/
├── vocab/            受控词表：camps / realms / lineages
├── sources.yml       原典登记表（T0/T1），带公版原文链接
└── shen/             人物词条，一人一文件（YAML）
scripts/
├── build-data.mjs    校验 + 生成 src/generated/entities.json
└── layout.mjs        预计算关系图布局，生成 graph.json
src/
├── pages/            index / shen/[slug] / tu / about
└── components/       身份标签、关系列表、关系图
```

## 本地开发

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # 产物在 dist/
```

## 数据校验

`npm run data` 会做这些检查，任何一条不过就构建失败：

- 词条 id 唯一，且与文件名一致
- `identity` 三个轴引用的 id 必须在 `data/vocab/*.yml` 中存在
- `relations[].target` 必须指向已存在的词条
- 叙事段落必须至少挂一个 `refs`，且 ref 必须在 `data/sources.yml` 中
- `tier` 只能是 T0/T1（T2/T3 不允许出现在叙事里）

## 许可

- 代码：MIT（见 `LICENSE`）
- 词条文本（`data/` 下自有撰写部分）：CC BY-SA 4.0
- 引用的古籍原文属公有领域；原文链接指向各公版库
