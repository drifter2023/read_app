# Agent 抽屉 · 开发交接

设计源文件：`design/聚焦阅读 App.dc.html` 第 10 轮 10a（逻辑在 `agc` 对象里，可在浏览器直接打开交互）。规格摘要见 `design/MVP 设计与范围 · 聚焦阅读.dc.html` Part C；选中文字提问与顶部设置面板见 C2 / C3。
本功能叠加在 4a 阅读页之上，不改动 4a 本身的排版、专注模糊和单词抽屉。

---

## 1. 范围

**做**
- 在 4a 阅读页按住左滑 → 书页被推开、缩小成卡片 → 露出 Agent 对话抽屉
- 抽屉内：当前句阅读视图（滑动/点选高亮一句）、对话流、快捷问题、输入框
- 标题区点击 → 下拉历史对话卡片，可切换/新建对话

**不做（本期）**
- 真实 LLM 接入：先用 `AgentService` 接口 + mock 回复（见 §6）
- 在书页正文上同步高亮所选句子
- 跨书的对话列表

---

## 2. 手势与动画

| 参数 | 值 | 说明 |
|---|---|---|
| 触发 | 水平位移 > 8px 且 \|dx\| > 1.2·\|dy\| | 否则交给竖向滚动；dy > 12px 先发生则放弃 |
| 方向 | 关闭态只认左滑；打开态只认右滑 | |
| 进度 p | `clamp(p0 − dx / (0.95·W − 60), 0, 1)` | W = 屏宽，跟手无阻尼（2026-10-14 起：分母为书页实际移动距离） |
| 松手吸附 | 速度 < −0.35 px/ms → 开；> 0.35 → 关；否则 p > 0.45 开 | |
| 动画曲线 | 420ms `cubic-bezier(.22,.8,.24,1)` | 开/关同曲线 |
| 关闭方式 | 点击左侧露出的书页条 / 右滑 | 拖拽结束 60ms 内吞掉 click |

随 p 插值（p=0 → p=1）：

- **书页（reader）**：`translateX(−p·(0.95·W − 60))`（打开时左侧固定露出 60px 书页：缩放后右边缘 = 0.95·W，减去 60；手机 402px 上与 W·0.8 相同，iPad 上不再遮挡抽屉。2026-10-14 业主决定），`scale(1 − 0.1p)`，`border-radius: 22p px`，`box-shadow: 0 10p 40p rgba(0,0,0,.18p)`，`transform-origin: center`
- **书页压暗层**：`#111`，opacity `0.06p`
- **抽屉（panel）**：`translateX((1−p)·12%)`（视差），opacity `0.3 + 0.7p`
- 抽屉左内边距 82px，右 20px —— 保证打开时左侧露出约 80px 书页条

> 抽屉在 DOM 中位于书页之下（z 序更低），由书页移开而露出，而非覆盖。

---

## 3. 视觉规范（9a）

**色彩** —— 中性、单一黑色强调，不使用彩色
| Token | 值 | 用途 |
|---|---|---|
| bg | `#f5f5f3` | 抽屉底 |
| surface | `#ffffff` | 当前句卡、历史卡、输入框 |
| chip | `#e9e9e6` | 快捷问题、标题激活态 |
| ink | `#111111` | 主文字、用户气泡底、发送按钮 |
| ink-body | `#1d1d1b` | 回答正文 |
| ink-2 | `rgba(0,0,0,.6)` | 引用、次要 |
| ink-3 | `rgba(0,0,0,.45)` | 标签、时间 |
| hairline | `rgba(0,0,0,.07)` | 分隔线 |
| page | `#faf8f3` | 4a 书页（不变） |

**字体**
| 角色 | 字体 | 规格 |
|---|---|---|
| 标题 | Newsreader | 24 / −0.01em |
| 小标签（大写） | IBM Plex Sans | 9.5–10px, letter-spacing .16–.18em |
| 当前句阅读视图 | Newsreader | 13.5 / 1.7 |
| 用户问题 | Noto Sans SC | 13.5 / 1.55，白字黑底 |
| Agent 回答 | Noto Serif SC | 14.5 / 1.8 |
| 引用标签 | Newsreader italic | 12px |

**形状**：卡片圆角 14–16；用户气泡 `18 18 4 18`；胶囊（chip/输入/引用）全圆；发送按钮 40px 圆。触控区 ≥ 34px，主要按钮 ≥ 40px。

---

## 4. 组件结构

```
AgentDrawer
├─ Header                       // 整个左侧标题块 = 历史入口
│   ├─ meta 行：[clock] 历史 N · CH.3 · THE TREELINE
│   └─ 标题：{session.title} [chevron ↓/↑]
│   ├─ HistoryScrim            // 下拉时覆盖对话区，rgba(245,245,243,.72)，点击关闭
│   └─ HistoryDropdown         // 白卡，top: header 底 + 8px，max-height 470
│       ├─ 「本书的对话 · 点选继续」
│       ├─ SessionRow × n      // 标题 · 时间 / 引用句 italic / 章节 · 条数；当前项圆点 + 浅底
│       └─ + 新对话 · 从当前句开始
├─ MessageList (scroll)
│   ├─ SentencePicker          // 当前句阅读视图
│   └─ Message × n             // user | agent | typing
├─ QuickChips (横向滚动)
└─ Composer                    // 输入 + 圆形发送
```

### 4.1 Header / 历史
- 点击左侧标题块切换 `historyOpen`；打开时标题块底色 `#e9e9e6`，chevron 旋转 180°
- 下拉动画：opacity 0→1（220ms）+ translateY −10px→0（280ms，同主曲线）
- 选中某会话：切换 `sessionId`，关闭下拉；若会话属于当前章节，SentencePicker 滚到该会话的句子
- 新对话：插入列表顶部，标题为空（显示首个问题或「新对话」），锚定当前所选句

### 4.2 SentencePicker（当前句阅读视图）
- 显示**本页全部文本**，按原段落排版（段首缩进 1em），字号小于正文
- 容器高 168px，上下 padding = 84px（= 容器高的一半，确保首尾句可滚到中线）；上下渐隐遮罩 28%/72%
- **滚动选句**：中线落在哪个句子的 line box 内即选中；同一行有多句时，保持当前选中项，否则取离上次选中最近的一句
- **点选**：点击句子 → 选中并平滑滚到中线；500ms 内忽略 scroll 回调以免抢选
- 首次挂载：居中到默认句（本页最后读到的句子），期间锁定 300ms
- 选中态：opacity 1、底色 `rgba(0,0,0,.06)`、下划线 `inset 0 -1.5px 0 #111`；其它句 opacity .42

### 4.3 消息
- user：右对齐黑底气泡；上方小号 italic 引号显示提问时所选句
- agent：「● 旁注」标签 + 衬线正文 + 可选引用胶囊（出处）
- typing：三点，透明度 .75/.4/.18
- 新消息或切换会话时滚到底；**仅选句变化时不滚动**

### 4.4 快捷问题
- 横向滚动胶囊；点击即发送；已用过的从列表移除（每个会话单独记录）

---

## 5. 数据模型

```ts
type AgentSession = {
  id: string;
  bookId: string;
  chapterId: string;
  chapterLabel: string;        // "Ch.3 · The Treeline"
  title?: string;              // 为空时取首个用户问题
  anchorSentenceId: string;    // 新建时所选句
  updatedAt: number;
  messages: AgentMessage[];
};

type AgentMessage =
  | { role: 'user'; text: string; sentenceId?: string; quote?: string; at: number }
  | { role: 'agent'; text: string; cite?: { label: string; sentenceId?: string }; at: number };

type DrawerState = {
  progress: number;            // 0..1，手势驱动
  open: boolean;
  historyOpen: boolean;
  sessionId: string;
  selectedSentenceId: string;
};
```

会话按 `bookId` 存储（本地持久化即可）；列表按 `updatedAt` 倒序。

---

## 6. AgentService 接口

```ts
interface AgentService {
  ask(input: {
    bookId: string;
    sessionId: string;
    question: string;
    sentence: { id: string; text: string };
    readUpTo: { chapterId: string; offset: number };  // 不剧透：只允许引用已读部分
    history: AgentMessage[];
  }): AsyncIterable<{ delta?: string; cite?: { label: string; sentenceId?: string }; done?: boolean }>;
  suggestions(ctx: { sentenceId: string }): Promise<string[]>;  // 快捷问题
}
```

本期用 `MockAgentService`：900ms 后返回固定回复（文案见设计文件 `replies` 字段）。
接入真实模型时：流式输出替换 typing 三点；system prompt 需约束「只基于已读内容回答、回答简短、给出出处」。

---

## 7. 任务清单

- [ ] A1 手势层：水平/竖直判定、进度 p、速度吸附、点击书页条关闭
- [ ] A2 书页/抽屉/压暗三层插值（§2 参数），开关同曲线
- [ ] A3 抽屉骨架 + 视觉 token（§3）
- [ ] A4 SentencePicker：段落渲染、中线命中、点选、首次居中锁
- [ ] A5 消息流 + typing + 引用胶囊；仅消息变化时滚底
- [ ] A6 快捷问题（每会话去重）+ Composer（回车/按钮发送，附带所选句）
- [ ] A7 Header 历史入口 + 下拉卡 + 遮罩；切换/新建会话
- [ ] A8 会话持久化（按书）
- [ ] A9 `AgentService` 接口 + Mock
- [ ] A10 回归：抽屉打开时单词抽屉、专注模糊、工具栏不响应手势

## 8. 待定
- 抽屉打开时是否暂停专注模糊
- 点正文单词时是否把该词自动带入对话
- 会话是否跨章节延续（目前：按书，所有章节共用列表）
- 左侧书页条宽度（目前约 80px）
