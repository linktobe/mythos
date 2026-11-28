# mythos · 神话图鉴（中文）

多套神话的中文词条库。每个词条都标注身份、关系和出处，不设唯一正典。

> **说明**：本仓库的词条文字、关系标注与出处比对，由 AI 按人工设定的体例搜集整理，未经神话学或古典学专业人士审读。可作入门读物与检索起点，不宜作为学术引用依据。体例、分级标准与立条原则由人制定；取材、撰写与核对由 AI 执行。详见站内「编例」页的「说明」一节。

- 语种：仅中文
- 体裁：纯文本，无图片
- 部署：Cloudflare Pages（纯静态）

## 编例（摘要）

1. 故事以成书最早的原始文本为主。原书没有写到的，才退一步采用后人整理的汇编，并在引用处注明是哪一本。后来的小说、电影、游戏只作一句交代，放在词条末尾的「后世演绎」。
2. 两种文献对同一事项记载不一致时，并排列出，各自注明出处；不将读来较顺的一种定为确论，取舍交由读者判断。
3. 每段叙述都要能追到具体来源，来源按体系分册登记在本体系的 `sources.yml`。
4. 原典里没有属于它自己那一段的，不单独立条，写进相邻词条的一句关系里。

分级标准与完整原则见站内「编例」页（`src/pages/about.astro`）。

## 目录

```
data/
├── categories.yml        全局类别词表（entity_type 的唯一真源）
├── pantheons.yml         体系注册表（唯一真源：体系、列表页、轴、关系词、图中心）
├── adaptation-kinds.yml  改编体裁词表
├── correspondences.yml   跨体系对照（不参与 relations）
└── norse/
    ├── entries/          词条，一条一文件（YAML）
    ├── vocab/            本体系词表：族 / 阵营 / 界
    └── sources.yml       本体系原典登记表，带公版原文链接
scripts/
└── build-data.mjs        校验并按体系生成 src/generated/entities/<体系>.json 与 search-index.json
src/
├── lib/content.ts        构建产物的统一入口，页面不直接 import JSON
├── components/           卡片墙 + 前端筛选
├── layouts/              页面骨架（体系切换、面包屑、辅助色）
├── pages/                index / [pantheon]/* / about / 404 / sitemap
├── styles/               全站样式
└── generated/            构建产物（不入库）
public/
├── _redirects            旧地址 301
└── search-index.json     构建时生成的搜索索引（不入库）
```

## 加一套新体系

1. 在 `data/pantheons.yml` 加一条，`status: live`，写好 `sections`（列表页）与 `axes`（启用哪几轴）。
2. 建 `data/<id>/`：`entries/*.yml`、`vocab/{lineages,camps,realms}.yml`、`sources.yml`。
3. `entity_type` 只能用 `data/categories.yml` 里登记过的值；新类别先登记，再在该体系的 `sections[].types` 里启用。

不需要改 schema，也不需要改页面代码。

## 本地开发

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # 产物在 dist/
npm run check    # 数据校验 + 布局 + 类型检查
```

Node 版本见 `.node-version`（22.23.4），Astro 钉在 `7.4.13`。

## 数据校验

`npm run data` 会逐项检查，任何一条不过，构建直接失败：

- 体系 id 唯一，`accent` 是 `#rrggbb`，`sections` 的 key 与路由不重复
- 每个 `types` 必须在 `categories.yml` 登记过，且同一类别不能分属两个 section
- 词条的 `pantheon` 与所在目录一致；`id` 与文件名一致
- `entity_type` 必须是本体系启用过的类别
- 身份各项引用的 id 必须在本体系 `vocab/` 中存在；`parent` 不得悬空，归类节点（`abstract`）不得被引用
- 关系类型必须在本体系 `relation_kinds` 里启用过；关系目标必须是同体系词条
- 叙事段落至少挂一个来源，来源必须在**本体系** `sources.yml` 中，且只允许 T0/T1
- 段落上的 `at`（节次）只能是该段 `refs` 里出现过的来源
- 改编体裁必须在 `adaptation-kinds.yml` 中登记
- 对称关系去重时把体系并入键

## 许可

- 代码：MIT（见 [LICENSE](./LICENSE)）
- 词条文本（`data/` 下自有撰写部分）：[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.zh)
- 引用的古籍原文属公有领域；原文链接指向各公版库
