/**
 * 博客测试数据播种脚本（临时文件，用完即删）。
 *
 *   cd server && bun --env-file ../.env ../.seed-blog-testdata.ts          # 播种
 *   cd server && bun --env-file ../.env ../.seed-blog-testdata.ts --clean  # 按清单还原
 *
 * 注意：必须以 server/ 为 cwd 运行 —— 附件落盘路径 UPLOAD_FILE_PATH 是按
 * process.cwd() 算的（shared/lib/pathConstant.ts），cwd 错了文件会存错目录。
 *
 * 走的是和线上一模一样的链路：publishSnapshot 生成公开快照 → attachBlogCover
 * 绑定封面 → 再发一次让 coverAttachmentId 落到快照上。不直接写 notePublication，
 * 否则测出来的行为跟用户真实操作不一致。
 */
import { PrismaClient } from '@prisma/client'
import sharp from 'sharp'
import path from 'node:path'
import { writeFile, mkdir, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { upsertBlogProfile, saveBlogTopic, attachBlogCover } from './server/lib/blog'
import { publishSnapshot } from './server/lib/publication'
import { composeCoverImage } from './server/lib/blogCoverComposition'
import { computeCoverTextLayout } from './shared/lib/blogCoverText'

const prisma = new PrismaClient()
const ACCOUNT_ID = 1
const SEED = 'blog-testdata-v1'
const UPLOAD_DIR = path.join(__dirname, 'server/.blinko/files')
const MANIFEST = path.join(__dirname, '.seed-blog-testdata.manifest.json')

const PALETTES: Record<string, [string, string, string, string]> = {
  violet: ['#1b1046', '#4930e8', '#623bff', '#b9a7ff'],
  blue: ['#08203f', '#0862df', '#2c92ff', '#9fd0ff'],
  slate: ['#111722', '#202735', '#455266', '#a9b6c9'],
  teal: ['#06282c', '#087d85', '#24b6bd', '#9ce9ec'],
}

type CoverPalette = keyof typeof PALETTES

/* ------------------------------ 封面底图 ------------------------------ */

/** 造一张「右侧有主体、左侧留白」的底图，再交给文字层合成器叠标题。 */
function coverBase(palette: CoverPalette, seed: number) {
  const [dark, mid, light, accent] = PALETTES[palette]
  const r = (n: number) => ((Math.sin(seed * 9301 + n * 49297) * 43758.5453) % 1 + 1) % 1
  const blobs = [0, 1, 2]
    .map((i) => {
      const cx = 1000 + r(i + 1) * 520
      const cy = 120 + r(i + 5) * 660
      const rad = 150 + r(i + 9) * 150
      const fill = [mid, light, accent][i]
      return `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${rad.toFixed(0)}" fill="${fill}" opacity="${(0.45 + r(i + 13) * 0.4).toFixed(2)}"/>`
    })
    .join('')
  const svg = `<svg width="1600" height="900" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${dark}"/>
      <stop offset="0.55" stop-color="${mid}"/>
      <stop offset="1" stop-color="${light}"/>
    </linearGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="80"/>
    </filter>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <g filter="url(#soft)">${blobs}</g>
  <g opacity="0.94">
    <rect x="1000" y="236" width="316" height="196" rx="30" fill="#ffffff" opacity="0.9"/>
    <rect x="1168" y="486" width="300" height="186" rx="30" fill="#ffffff" opacity="0.66"/>
  </g>
</svg>`
  return sharp(Buffer.from(svg)).resize(1600, 900).webp({ quality: 92 }).toBuffer()
}

/* ------------------------------ 测试文章 ------------------------------ */

type Article = {
  key: string
  title: string
  coverTitle: string
  coverSubtitle: string
  palette: CoverPalette
  content: string
  topics: string[]
}

const ARTICLES: Article[] = [
  {
    key: 'recall-three-stage',
    title: '推荐召回的三段式改造：从规则到向量再到融合',
    coverTitle: '召回三段式改造',
    coverSubtitle: '规则 · 向量 · 融合，一次线上改动的复盘',
    palette: 'violet',
    topics: ['recsys', 'ai-engineering'],
    content: `## 为什么要动召回

召回是推荐链路里最便宜的一环，也是最容易被低估的一环。线上出问题的时候，排序模型总会被第一个怀疑，但真正拖后腿的往往是召回：**它决定了后面所有模型能看到的世界有多大**。

这次改造的起因很朴素：长尾商品的曝光一直没有起色，新商品冷启几乎没有量。我们把召回拆成三段来做，规则负责保底，向量负责覆盖，融合层负责把两边的分数放到同一个尺度上。

### 一、规则召回：可解释，但天花板很低

规则召回最大的优点是可解释，出问题能直接查到是哪条规则命中了。缺点也明显：规则数量一多，互相之间就开始打架，维护成本是线性上涨的。

> 我们曾经同时上线过 300 多条规则，最后没人敢动。

### 二、向量召回：覆盖长尾，但分数不可比

向量召回把用户和物料都映射到同一个空间，相似度天然可比，长尾覆盖效果好。问题是它返回的分数和规则分完全不是一回事 —— 规则分可能是 82 分，向量分可能是 0.37，直接加权会被向量分彻底压死。

### 三、融合层：先校准，再谈策略

融合的方案我们试了三种：

| 策略 | 优点 | 代价 |
| --- | --- | --- |
| 分数直接加权 | 实现最简单 | 分数不可比时严重失真 |
| 分层截断 | 结果稳定可控 | 浪费召回配额 |
| 先校准再融合 | 效果最好 | 需要额外维护校准模型 |

最后选了第三种。核心是给两路分数各做一次**分位数校准**，把它们都拉到同一个区间，再按业务权重融合。

\`\`\`python
def fuse(rule_scores, vector_scores, w_rule=0.35):
    """两路分数先做分位数校准，再加权融合"""
    r = quantile_calibrate(rule_scores)
    v = quantile_calibrate(vector_scores)
    return w_rule * r + (1 - w_rule) * v
\`\`\`

校准的坑在于：校准模型的训练窗口必须和线上打分窗口对齐，否则分布一变分数就飘。我们最初按天校准，结果每次大促流量结构一变，分数分布整体偏移，融合层直接崩。

### 四、上线后的复盘

- 长尾商品曝光占比从 6% 提升到 21%
- 新商品冷启 3 日曝光量翻倍
- 融合层 P99 耗时增加了 4.2ms，在预算之内

最后一条是这次改造里最让我在意的部分 —— 效果提升容易，**在不涨延迟的前提下**提升才是难的。

> 结论：先把分数校准做对，再谈融合策略。反过来做的系统，最后都长成了不可维护的加权和。`,
  },
  {
    key: 'ab-platform-pitfalls',
    title: 'AB 实验平台里最容易踩的五个坑',
    coverTitle: 'AB 实验的五个坑',
    coverSubtitle: '分流、指标、样本量与那张被忽略的表',
    palette: 'blue',
    topics: ['engineering-efficiency'],
    content: `## 写在前面

做实验平台这件事，最大的误区是把它当成"分流工具 + 报表工具"。真正让实验结论不可信的，往往是中间那些看起来无关紧要的环节。

下面五个坑，是我踩过之后写进团队规范里的。

### 一、分流哈希没有按用户维度稳定

最常见的问题：用户在实验组和对照组之间漂移。原因通常是分流用的 key 里带了会变的字段 —— 比如设备 ID 换了，或者用了会话级标识。

\`\`\`
❌ hash(userId + sessionId)   // sessionId 会变
✅ hash(userId)                // 用户维度稳定
\`\`\`

判断标准很简单：同一个用户在实验期内反复进入，必须落在同一组。

### 二、指标口径在实验组和对照组不一致

这个坑最隐蔽。某个同学在实验组接了一个新的埋点字段，对照组没接，指标自然"实验组更好"。上线前必须有一份**指标口径对照表**，写清楚每个指标在两组分别取自哪个字段。

### 三、忽略样本量，盯着 1% 的波动下结论

平台会给你一个"实验组领先 1.2%"的结论，但不会告诉你这个结论的置信区间。样本量不够的时候，1.2% 的领先和随机波动没有区别。

我们现在的规矩是：任何指标在置信区间没收敛之前，一律标注"结论不可信"。

### 四、忽略分流比例的爬坡期

新实验开始时，分流是逐步放量的。爬坡期内，实验组用户的行为还不稳定，直接看全量结论会被污染。

### 五、实验之间的相互干扰

两个实验同时作用于同一个页面，一个改按钮文案，一个改推荐位。结论可能两个都不对。平台需要提供**实验互斥组**机制。

### 一张被忽略的表

我们后来加了一张表：每次实验必须登记**假设、指标、预期效应量、实验周期**。这张表最大的价值不在于统计，而在于它逼着写实验的人先把想验证的东西说清楚。

> 半年下来，团队里"这个实验到底想验证什么"答不上来的情况，从七成降到了不到一成。`,
  },
  {
    key: 'tracking-review-checklist',
    title: '埋点方案评审清单：从事件定义到回溯口径',
    coverTitle: '埋点方案评审清单',
    coverSubtitle: '评审时照着念，返工次数少一半',
    palette: 'teal',
    topics: ['data-platform'],
    content: `## 为什么要有清单

埋点方案评审最常见的失败模式，是评审时凭感觉点头，上线后各写各的。三周后要复盘一个指标，才发现三条链路各埋了一套字段名。

清单不是为了流程，是为了让评审时的注意力集中在真正会返工的地方。

### 一、事件定义

- 事件名是否用**过去式**（\`item_clicked\` 而不是 \`click_item\`）
- 是否带唯一的事件 ID，能被幂等去重
- 是否区分了「用户主动」和「系统触发」

### 二、参数设计

- 参数字段是否用下划线小写，不要驼峰
- 枚举值是否封闭，有没有留扩展位
- 有没有把易变信息写进参数（比如把"当前价格"放进事件参数）

最后一条特别容易踩：价格这类会变的值如果写进了事件参数，事后回溯就永远拿不到历史真实值。

### 三、口径对齐

| 角色 | 关心的问题 |
| --- | --- |
| 数据 | 怎么去重、怎么关联 |
| 产品 | 这个数字怎么解释、怎么汇报 |
| 研发 | 什么时候打、失败怎么补 |

三方的答案必须在评审会上同时说清楚，而不是各自留下一句"后面再对一下"。

### 四、回溯能力

上线前必须回答一个问题：**这个事件三个月后还能不能查到历史数据？**

如果答案是不能，那这个埋点就不该上。

### 五、验收方式

约定一个验收动作：上线后由非开发角色（比如产品或数据）自己去后台查一次数据。开发自测通过不代表别人能查出来。

> 清单的本质是把"评审时靠经验"的部分固定下来，让注意力留给真正需要讨论的边界情况。`,
  },
  {
    key: 'ai-search-offline-eval',
    title: 'AI 搜索的离线评测怎么做才靠谱',
    coverTitle: 'AI 搜索离线评测',
    coverSubtitle: '相关性、忠实度与那批被人工标歪的样本',
    palette: 'slate',
    topics: ['ai-engineering'],
    content: `## 离线评测在 AI 搜索里为什么更难

传统搜索的离线评测相对直接：query 和 doc 都存在，相关性标注完就能算指标。AI 搜索多了一层生成，评测对象从"排得准不准"变成了"**答得对不对**"，而后者没法用点击日志直接替代。

我们把离线评测拆成了三个维度，分别对应三个不同的问题。

### 一、相关性：召回的文档本身对不对

这一层可以沿用传统做法：用人工标注的 query-doc 对评估召回。区别是 AI 搜索的召回输入是 query，输出是文档列表，所以标注粒度更粗，也更依赖 query 理解的质量。

### 二、忠实度：答案有没有编

忠实度衡量的是"答案里的每个论断，能不能在召回文档里找到支撑"。这是大模型应用特有的问题，也是最容易出事的。

我们的做法是让一个裁判模型逐句标注文档支撑关系，然后人工抽检校准裁判模型。

\`\`\`python
faithful = supported_claims / total_claims
\`\`\`

关键在于裁判模型必须先用人工标注校准过，否则只是用一个模型去评价另一个模型。

### 三、答案质量：有用吗

相关性对了、忠实度也高，答案仍然可能没用。这一层最主观，也是最容易被"我觉得挺好"污染的一层。

我们的做法是把它拆成可比较的子项：覆盖度、结构清晰度、有没有给出可执行的下一步。

### 样本集怎么攒

样本集是最容易被低估的工程量。我们的经验：

- 从线上真实 query 里采样，不要人工造
- 覆盖长尾（占比高的"怎么做""为什么"这类问题）
- 每个季度做一次**回归冻结**，固定一批样本不删不改

最后一条尤其重要：评测集一旦开始频繁变动，所有历史对比结论就都失效了。

> 离线评测的价值不在于给出一个分数，而在于让"这次改动到底是变好了还是变差了"这个问题有答案。分数本身没有意义。`,
  },
  {
    key: 'weekly-report-decision',
    title: '一线产品经理的周报写作法：把流水账变成决策记录',
    coverTitle: '周报写成决策记录',
    coverSubtitle: '三段结构，告别流水账',
    palette: 'violet',
    topics: ['product-thinking'],
    content: `## 流水账式周报的问题

大部分周报长这样：本周完成了 A、B、C，下周计划做 D、E、F。领导看完要自己去判断哪些重要，而这件事本来就应该由写周报的人完成。

流水账的问题不是"写得少"，而是**把判断的责任推给了读者**。

## 三段式结构

### 第一段：本周最重要的一个结论

只写一条，并且必须是一个结论而不是一个动作。

- ❌ 本周完成了推荐策略 V3.2 的联调
- ✅ V3.2 联调完成，实验结论是旧策略在小流量下更优，V3.2 暂缓全量

区别在于，前者需要读者自己判断重要程度，后者直接给出了判断。

### 第二段：支撑这个结论的关键事实

三到五条，每条都要能被追问细节。要么有数据，要么有明确的"还没有数据，正在补"。

### 第三段：需要对方做决定的事

这一段是周报真正的价值所在。明确写出：需要谁、在什么时间之前、做什么决定。

> 写不出第三段的周报，通常说明这一周没有产生需要别人配合的事 —— 这本身也是个值得警惕的信号。

## 几个具体建议

**先写第一段，再补第二段。** 顺序反过来很容易写成一堆事情，然后硬凑一个结论。

**不要按时间顺序写。** 时间顺序是给人做流水账用的，读者不关心你周一周二做了什么。

**允许出现"没做成"。** 写"这个方向验证失败，结论是 X"，比写"这个方向还在推进中"有价值得多。

## 一个自检方法

写完之后问自己：如果领导只看第一段就决定了要不要找我谈话，他会不会找错人？

如果答案是"会"，那说明第一段写歪了 —— 要么不是本周最重要的事，要么表述里塞了太多信息。`,
  },
]

/* ------------------------------ 主题定义 ------------------------------ */

const TOPICS = [
  {
    id: 11, // 已存在的「推荐系统」，补充描述与成员
    name: '推荐系统',
    slug: 'recsys',
    desc: '召回、排序与线上策略的工程实践',
    color: '#7055f8',
    isPublished: true,
  },
  {
    id: 69, // 并行工作建的「产品思考」，把随机 slug 换成可读标识
    name: '产品思考',
    slug: 'product-thinking',
    desc: '从需求到上线，产品经理真正要盯住的几件事',
    color: '#f0803c',
    isPublished: true,
  },
  { name: 'AI 工程', slug: 'ai-engineering', desc: '把模型真正接进业务链路的做法与踩坑', color: '#2f6bff', isPublished: true },
  { name: '数据体系', slug: 'data-platform', desc: '埋点、指标、模型与数据驱动决策', color: '#00a3a3', isPublished: true },
  { name: '工程效率', slug: 'engineering-efficiency', desc: '工具链、自动化与那些值得沉淀下来的流程', color: '#8b5cf6', isPublished: true },
]

/** 真实笔记的归类：让专题页不只有测试文章。 */
const REAL_NOTE_TOPICS: Record<string, number[]> = {
  recsys: [15],
  'data-platform': [8, 174],
  'product-thinking': [175],
  'engineering-efficiency': [106],
  'ai-engineering': [],
}

const PROFILE = {
  displayName: 'Brian Bai',
  tagline: '搜索与推荐工程师 · 把复杂系统写成能读懂的笔记',
  bio: `我是 Brian，一名搜索与推荐方向的工程师，日常在做召回、排序、实验平台和 AI 搜索相关的工作。

这个博客是我的个人知识库：工作里踩过的坑、验证过的方法、以及一些被反复推翻的直觉，都写在这里。我不写"最佳实践"速查表，只写自己真的做过、并且能给出数据和结论的部分。

写博客对我来说是一个整理思路的过程 —— 很多想法在脑子里是模糊的，只有落到纸上、并且要让别人读得懂，才会暴露出逻辑上的窟窿。`,
  avatarUrl: '/api/file/20261016-40997.webp',
  homepage: 'https://ink.baispace.cn',
  links: [
    { label: 'Ink 博客', url: 'https://ink.baispace.cn/blog' },
    { label: 'RSS 订阅', url: 'https://ink.baispace.cn/blog/feed.xml' },
    { label: 'GitHub', url: 'https://github.com/baispace' },
  ],
  isPublished: true,
}

/* ------------------------------ 播种 ------------------------------ */

type Manifest = {
  seed: string
  createdNotes: { id: number; publishId: string | null; title: string }[]
  createdTopics: { id: number; name: string }[]
  createdAttachments: { id: number; path: string; file: string }[]
  before: {
    profile: any
    topics: {
      id: number
      name: string
      slug: string
      desc: string
      color: string
      sortOrder: number
      isPublished: boolean
      noteIds: number[]
    }[]
  }
}

async function snapshotBefore(): Promise<Manifest['before']> {
  const profile = await prisma.blogProfile.findUnique({ where: { accountId: ACCOUNT_ID } })
  const topics = await prisma.blogTopic.findMany({ where: { accountId: ACCOUNT_ID }, orderBy: { id: 'asc' } })
  return {
    profile: profile ? { ...profile, links: profile.links ?? [] } : null,
    topics: await Promise.all(
      topics.map(async (t) => {
        const links = await prisma.blogTopicNote.findMany({ where: { topicId: t.id }, orderBy: { sortOrder: 'asc' } })
        return {
          id: t.id,
          name: t.name,
          slug: t.slug,
          desc: t.desc,
          color: t.color,
          sortOrder: t.sortOrder,
          isPublished: t.isPublished,
          noteIds: links.map((l) => l.noteId),
        }
      }),
    ),
  }
}

/** 取出此前播种过的测试文章（按 metadata 里的 testKey 匹配）。 */
async function findSeededNotes() {
  const notes = await prisma.notes.findMany({
    where: { accountId: ACCOUNT_ID },
    select: { id: true, publishId: true, metadata: true, publication: { select: { title: true, revision: true, coverAttachmentId: true } } },
  })
  const out = new Map<string, (typeof notes)[number]>()
  for (const n of notes) {
    const meta = n.metadata as any
    if (meta && typeof meta === 'object' && meta.testSeed === SEED && typeof meta.testKey === 'string') out.set(meta.testKey, n)
  }
  return out
}

async function seed() {
  const before = await snapshotBefore()
  const manifest: Manifest = { seed: SEED, createdNotes: [], createdTopics: [], createdAttachments: [], before }
  const seeded = await findSeededNotes()
  const noteIdByKey = new Map<string, number>()

  console.log('→ 写入个人公开资料')
  await upsertBlogProfile(prisma, ACCOUNT_ID, PROFILE)

  console.log('→ 写入主题')
  const topicIdsBySlug = new Map<string, number>()
  for (const t of TOPICS) {
    // 优先按 id 认领已有专题（id 11/69 是本机原就有的），否则按 slug 认领。
    const byId = t.id
      ? await prisma.blogTopic.findFirst({ where: { id: t.id, accountId: ACCOUNT_ID } })
      : null
    const bySlug = await prisma.blogTopic.findUnique({
      where: { accountId_slug: { accountId: ACCOUNT_ID, slug: t.slug } },
    })
    let target = byId ?? bySlug
    if (byId && bySlug && byId.id !== bySlug.id) {
      // id 与 slug 指向两个专题：把 slug 那个的成员并进 id 那个，再删掉占位的。
      // 不这么做就会出现两个同名专题，公开站会列出重复的分组。
      const links = await prisma.blogTopicNote.findMany({ where: { topicId: bySlug.id } })
      for (const l of links) {
        const exists = await prisma.blogTopicNote.findUnique({
          where: { topicId_noteId: { topicId: byId.id, noteId: l.noteId } },
        })
        if (!exists)
          await prisma.blogTopicNote.create({
            data: { topicId: byId.id, noteId: l.noteId, sortOrder: l.sortOrder },
          })
      }
      await prisma.blogTopic.delete({ where: { id: bySlug.id } })
      console.log(`   ~ 合并重复专题 ${bySlug.name} → ${byId.name}`)
    }
    if (!target) {
      target = await prisma.blogTopic.create({
        data: {
          accountId: ACCOUNT_ID,
          name: t.name,
          slug: t.slug,
          desc: t.desc,
          color: t.color,
          isPublished: t.isPublished,
          sortOrder: await prisma.blogTopic.count({ where: { accountId: ACCOUNT_ID } }),
        },
      })
      manifest.createdTopics.push({ id: target.id, name: target.name })
      console.log(`   + ${target.name} (${target.slug})`)
    }
    topicIdsBySlug.set(t.slug, target.id)
  }

  console.log('→ 写入并发布测试文章')
  for (const [index, a] of ARTICLES.entries()) {
    const reused = seeded.get(a.key)
    if (reused) {
      noteIdByKey.set(a.key, reused.id)
      manifest.createdNotes.push({ id: reused.id, publishId: reused.publishId, title: a.title })
      // 复用时把封面按当前排版重做一遍：排版规则改了要能直接刷新，
      // 覆盖原文件即可，路径不变所以不用动数据库，也不用重新发布。
      const cover = await prisma.attachments.findFirst({
        where: { accountId: ACCOUNT_ID, noteId: reused.id, metadata: { path: ['blogTestCover', 'key'], equals: a.key } },
        select: { id: true, path: true, name: true },
      })
      if (cover) {
        const buffer = await composeCoverImage({
          base: await coverBase(a.palette, index + 7),
          layout: computeCoverTextLayout({
            containerWidth: 1600,
            containerHeight: 900,
            placement: 'double',
            title: a.coverTitle,
            subtitle: a.coverSubtitle,
          }),
          canvasWidth: 1600,
          canvasHeight: 900,
          palette: a.palette,
          align: 'left',
        })
        await writeFile(path.join(UPLOAD_DIR, cover.name), buffer)
        await prisma.attachments.update({ where: { id: cover.id }, data: { size: buffer.length } })
        console.log(`   = #${reused.id} ${a.title}（已存在，封面已按新排版重做）`)
      } else {
        console.log(`   = #${reused.id} ${a.title}（已存在，跳过创建）`)
      }
      continue
    }
    const note = await prisma.notes.create({
      data: {
        accountId: ACCOUNT_ID,
        type: 1,
        content: a.content,
        metadata: { title: a.title, testSeed: SEED, testKey: a.key },
        sortOrder: 0,
      },
    })

    // 走真实发布链路：第一次发布建快照
    await publishSnapshot(prisma, ACCOUNT_ID, { id: note.id })

    // 封面：本地合成，不依赖任何 AI 服务
    const base = await coverBase(a.palette, index + 7)
    const buffer = await composeCoverImage({
      base,
      layout: computeCoverTextLayout({
        containerWidth: 1600,
        containerHeight: 900,
        placement: 'double',
        title: a.coverTitle,
        subtitle: a.coverSubtitle,
      }),
      canvasWidth: 1600,
      canvasHeight: 900,
      palette: a.palette,
      align: 'left',
    })
    const filename = `ink-seed-${a.key}-${randomUUID().slice(0, 8)}.webp`
    await mkdir(UPLOAD_DIR, { recursive: true })
    await writeFile(path.join(UPLOAD_DIR, filename), buffer)
    const attachment = await prisma.attachments.create({
      data: {
        accountId: ACCOUNT_ID,
        noteId: note.id,
        name: filename,
        path: `/api/file/${filename}`,
        size: buffer.length,
        type: 'image/webp',
        metadata: { blogTestCover: { seed: SEED, key: a.key } },
      },
    })
    manifest.createdAttachments.push({ id: attachment.id, path: attachment.path, file: filename })
    await attachBlogCover(prisma, ACCOUNT_ID, note.id, attachment.path)
    // 第二次发布：把 draftCoverAttachmentId 落到公开快照的 coverAttachmentId 上
    await publishSnapshot(prisma, ACCOUNT_ID, { id: note.id })

    const after = await prisma.notes.findUniqueOrThrow({
      where: { id: note.id },
      select: { publishId: true, publication: { select: { revision: true, coverAttachmentId: true, title: true } } },
    })
    noteIdByKey.set(a.key, note.id)
    manifest.createdNotes.push({ id: note.id, publishId: after.publishId, title: a.title })
    console.log(
      `   + #${note.id} ${a.title} → ${after.publishId} (rev ${after.publication?.revision}, cover ${after.publication?.coverAttachmentId})`,
    )
  }

  console.log('→ 归类文章到主题')
  for (const t of TOPICS) {
    const topicId = topicIdsBySlug.get(t.slug)!
    const members = new Set<number>(REAL_NOTE_TOPICS[t.slug] ?? [])
    for (const a of ARTICLES) {
      if (!a.topics.includes(t.slug)) continue
      const id = noteIdByKey.get(a.key)
      if (id) members.add(id)
    }
    await saveBlogTopic(prisma, ACCOUNT_ID, {
      id: topicId,
      name: t.name,
      slug: t.slug,
      desc: t.desc,
      color: t.color,
      isPublished: t.isPublished,
      noteIds: [...members],
    })
    console.log(`   · ${t.name} ← ${[...members].join(', ')}`)
  }

  // 清单要能跨多次运行累加：重跑时文章会被复用、专题已存在，
  // 若直接覆盖清单，clean() 就会漏掉上一轮创建的行。
  const merged = await mergeManifest(manifest)
  await writeFile(MANIFEST, JSON.stringify(merged, null, 2), 'utf8')
  console.log(`\n完成。清单已写入 ${MANIFEST}`)
}

/** 把本次运行产生的数据并进已有清单；before 状态保留第一次播种前的快照。 */
async function mergeManifest(current: Manifest): Promise<Manifest> {
  let previous: Manifest | null = null
  try {
    previous = JSON.parse(await Bun.file(MANIFEST).text())
  } catch {}
  if (!previous) return current
  const mergeById = <T extends { id: number }>(a: T[], b: T[]) => {
    const seen = new Set(a.map((x) => x.id))
    return [...a, ...b.filter((x) => !seen.has(x.id))]
  }
  return {
    seed: SEED,
    // before 取最早那次：重跑时 before 已经含了上一轮造的数据
    before: previous.before ?? current.before,
    createdNotes: mergeById(previous.createdNotes ?? [], current.createdNotes),
    createdTopics: mergeById(previous.createdTopics ?? [], current.createdTopics),
    createdAttachments: mergeById(previous.createdAttachments ?? [], current.createdAttachments),
  }
}

/* ------------------------------ 还原 ------------------------------ */

async function clean() {
  let manifest: Manifest
  try {
    manifest = JSON.parse(await Bun.file(MANIFEST).text())
  } catch {
    console.error('找不到清单文件，无法还原：', MANIFEST)
    process.exit(1)
  }

  console.log('→ 删除测试文章与附件')
  for (const att of manifest.createdAttachments) {
    await prisma.attachments.deleteMany({ where: { id: att.id } })
    try {
      await unlink(path.join(UPLOAD_DIR, att.file))
    } catch {}
  }
  const noteIds = manifest.createdNotes.map((n) => n.id)
  if (noteIds.length) {
    await prisma.notePublication.deleteMany({ where: { noteId: { in: noteIds } } })
    await prisma.notes.deleteMany({ where: { id: { in: noteIds } } })
  }

  console.log('→ 删除新建主题')
  if (manifest.createdTopics.length) {
    await prisma.blogTopic.deleteMany({ where: { id: { in: manifest.createdTopics.map((t) => t.id) } } })
  }

  console.log('→ 还原原有主题与资料')
  for (const t of manifest.before.topics) {
    await prisma.blogTopic.update({
      where: { id: t.id },
      data: {
        name: t.name,
        slug: t.slug,
        desc: t.desc,
        color: t.color,
        sortOrder: t.sortOrder,
        isPublished: t.isPublished,
      },
    })
    await prisma.blogTopicNote.deleteMany({ where: { topicId: t.id } })
    if (t.noteIds.length) {
      await prisma.blogTopicNote.createMany({
        data: t.noteIds.map((noteId, sortOrder) => ({ topicId: t.id, noteId, sortOrder })),
      })
    }
  }
  if (manifest.before.profile) {
    const p = manifest.before.profile
    await prisma.blogProfile.upsert({
      where: { accountId: ACCOUNT_ID },
      create: { accountId: ACCOUNT_ID, ...p },
      update: {
        displayName: p.displayName,
        tagline: p.tagline,
        bio: p.bio,
        avatarUrl: p.avatarUrl,
        homepage: p.homepage,
        links: p.links,
        isPublished: p.isPublished,
      },
    })
  } else {
    await prisma.blogProfile.deleteMany({ where: { accountId: ACCOUNT_ID } })
  }

  console.log('还原完成。')
}

const isClean = process.argv.includes('--clean')
;(isClean ? clean() : seed())
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
