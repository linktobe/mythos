# mythos · 神话人物图鉴（中文）

以原始文本为主干的中文神话人物词条库。每个人物都标注身份、关系和出处，不设唯一正典。

- 语种：仅中文
- 体裁：纯文本，无图片
- 部署：Cloudflare Pages（纯静态）

## 编例（摘要）

1. 故事以成书最早的原始文本为主。原书没有写到的，才退一步采用后人整理的汇编，并在引用处注明是哪一本。后来的小说、电影、游戏只作一句交代，放在词条末尾的「后世演绎」。
2. 两种文献对同一事项记载不一致时，并排列出，各自注明出处；不将读来较顺的一种定为确论，取舍交由读者判断。
3. 每段叙述都要能追到具体来源，来源清单在 `data/sources.yml`。
4. 每个词条沿三个维度分别标注、分开记录：族（血统所属）、阵营（立场归属）、界（所居世界）。三者常常并不一致，故不合并，且可随时间变化。
5. 每个词条另附一句职能定位与一段职责说明，交代它在神话中「做什么」；缺此一句，人物条目便只剩家谱。

分级标准与完整原则见站内「编例」页（`src/pages/about.astro`）。

## 词条字段

| 字段 | 含义 |
| --- | --- |
| `id` / `name` / `name_latin` | 文件标识、中文名、原文名 |
| `entity_type` | 神祇 / 巨人 / 矮人 / 群体 / 异兽 / 器物 |
| `summary` | 一句话概括 |
| `role.title` / `role.brief` | 角色定位、职责说明 |
| `identity.lineage` | 血统所属 |
| `identity.camp` | 政治归属，可带起止时间 |
| `identity.realm` | 居所 |
| `narrative[]` | 主叙事段落，每段挂 `refs` |
| `variants[]` | 异文，各挂 `refs` |
| `relations[]` | 关系：目标、类型、说明、出处 |
| `legacy[]` | 一句话带过的后世演绎 |
| `adaptations[]` | 改编作品对照：作品、形象、与原典的出入 |

## 目录

```
data/
├── vocab/            词表：族 / 阵营 / 界
├── sources.yml       原典登记表，带公版原文链接
└── shen/             词条，一条一文件（YAML）
scripts/
├── build-data.mjs    校验并生成 src/generated/entities.json
└── layout.mjs        预先算好关系图坐标，生成 graph.json
src/
├── layouts/          页面骨架
├── pages/            index / shen/[slug] / qi / tu / about
├── styles/           全站样式
└── generated/        构建产物（不入库）
```

## 本地开发

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # 产物在 dist/
```

## 数据校验

`npm run data` 会逐项检查，任何一条不过，构建直接失败：

- 词条 id 唯一，且与文件名一致
- 身份三项引用的 id 必须在 `data/vocab/*.yml` 中存在
- 关系指向的条目必须存在
- 叙事段落至少挂一个来源，且来源必须在 `data/sources.yml` 中
- 来源等级只允许原典与古代汇编；后世重述和现代改编不能进叙事

## 许可

- 代码：MIT（见 `LICENSE`）
- 词条文本（`data/` 下自有撰写部分）：CC BY-SA 4.0
- 引用的古籍原文属公有领域；原文链接指向各公版库
