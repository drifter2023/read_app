# Prompt 对比：语法分析 + 整句译文

- **日期：** 2026-09-29
- **Prompt 原文：** `scripts/prompt-lab/prompts.ts`（A、B、C、D）
- **跑法：** 每个 prompt 交给一个独立的子代理（Claude Opus 5.5），它只读这个 system prompt 和同一条用户消息，再按格式作答。每个跑 1 次。
- **注意：** app 实际用的是 DeepSeek Flash，这里测的是 Claude 照 prompt 作答的结果。这次能比出 prompt 写法的差别，但 Flash 的实际效果还要用 `scripts/prompt-lab/run.ts` 再跑一遍才能确认。

## 测试输入

```text
前一句：Only Gatsby, the man who gives his name to this book, was exempt from my reaction—Gatsby, who represented everything for which I have an unaffected scorn.
目标句：If personality is an unbroken series of successful gestures, then there was something gorgeous about him, some heightened sensitivity to the promises of life, as if he were related to one of those intricate machines that register earthquakes ten thousand miles away.
单词数：42
```

（《了不起的盖茨比》第一章。这一句同时有条件句、there be、同位语、as if 虚拟语气和定语从句。）

## 四个 prompt 的思路

| | 名字 | 译文部分怎么写 |
|---|---|---|
| **A** | 最小改动 | 现有 v2 加一行「译文：」，只要求「忠实、通顺，一句话译完」 |
| **B** | 译文规则细化 | 五条规则：忠实（不增不减）、通顺（按中文重组语序）、语境（用前一句判断指代）、风格（保留修辞和文学色彩）、专名 |
| **C** | 结构对照译文 | 译文贴着原句结构走；语法要点用「」引用对应的中文片段 |
| **D** | 译者身份，少规则 | 身份改为「资深英美文学译者 + 语法老师」，只要求「出版译本水准」 |

四个 prompt 的输出格式、长度规则、语法要点规则完全相同，只有上表这一部分不同。

## 1. 译文对比

| | 译文 |
|---|---|
| **A** | 如果说人格就是一连串不间断的成功姿态，那么他身上就有某种华美的东西，一种对人生种种希望的高度敏感，仿佛他和那些能记录万里之外地震的精密仪器有着某种亲缘。 |
| **B** | 如果说人格就是一连串从未间断的成功姿态，那么他身上确有某种华美的东西，一种对人生种种希望的高度敏感，仿佛他与那些能记录下万里之外地震的精密仪器**息息相通**。 |
| **C** | 如果说**个性**就是一连串不间断的成功姿态，那么他身上就有某种华美的东西，一种对人生种种希望的高度敏感，仿佛他和那种能记录**一万英里以外**地震的精密仪器有亲缘关系。 |
| **D** | **倘若**人格是由一连串未曾间断的成功姿态构成的，那么他身上确有某种华美的东西，一种对人生种种希望的高度敏感，仿佛他与那些能记录万里之外地震的精密仪器有着某种亲缘。 |

### 逐处比较

| 原文 | A | B | C | D | 说明 |
|---|---|---|---|---|---|
| If … then | 如果说……那么 | 如果说……那么 | 如果说……那么 | 倘若……那么 | 都对；D 更书面 |
| personality | 人格 | 人格 | 个性 | 人格 | 这里讲的是一个人外在的整体表现，两种译法都说得通 |
| unbroken series | 不间断的 | 从未间断的 | 不间断的 | 未曾间断的 | 都对 |
| as if he were related to | 有着某种亲缘 | **息息相通** | 有亲缘关系 | 有着某种亲缘 | B 加入了原文没有的意思：related 是「有亲缘」，不是「相通」 |
| ten thousand miles away | 万里之外 | 万里之外 | **一万英里以外** | 万里之外 | C 逐字直译；「万里之外」更自然 |

### 译文小结

- 四个译文的意思都正确，句子结构也几乎一样。
- **A、D 最稳：**准确、自然，没有多余的发挥。
- **B 有一处偏离：**「息息相通」读起来更有文采，却违反了 B 自己的「不增不减」规则。规则要求保留文学色彩，反而把模型推向了发挥。
- **C 有一处生硬：**「一万英里以外」符合「对照译文」的设定，但中文读者会觉得别扭。

## 2. 句型对比

| | 句型 |
|---|---|
| **A** | If 条件句 + there be 主句 + as if 从句 |
| **B** | 条件状语从句 + there be 主句 + as if 从句 |
| **C** | if 条件从句＋there be 主句＋同位语＋as if 从句 |
| **D** | 条件状语从句 + there be 主句 + 同位语 + as if 从句 |

都不超过 24 字的上限。C 和 D 把同位语也写进了句型，结构交代得最完整。

## 3. 语法要点对比

四个 prompt 都写了 5 条要点，找出的结构完全一致：主干、条件状语从句、同位语、as if 虚拟语气、定语从句。

| 要点 | A | B | C | D |
|---|---|---|---|---|
| **主干** | there was something gorgeous about him，gorgeous 后置修饰 something | there was something gorgeous about him，there be 句型；形容词 gorgeous 后置修饰 something | there was something gorgeous about him，即「他身上有某种华美的东西」，gorgeous 后置修饰 something | there was something gorgeous about him，gorgeous 后置修饰 something |
| **条件从句** | If personality is … 与 then 呼应，意为「如果说……那么」，先下定义再得结论 | If personality is … then 构成条件推论，then 呼应 if，表示“既然如此，那么” ⚠️ | If personality is … gestures 是条件从句，与 then 呼应，即「如果说……那么」 | If personality is … 提出假设前提，与主句开头的 then 呼应 |
| **同位语** | some heightened sensitivity 是 something gorgeous 的同位语，把「华美」具体化 | some heightened sensitivity to the promises of life 补充说明 something gorgeous，是什么样的华美 | some heightened sensitivity to the promises of life 补充说明 something gorgeous，即「一种……高度敏感」 | some heightened sensitivity 补充说明 something gorgeous 具体指什么 |
| **虚拟语气** | as if he were related 用 were，表示只是比喻，并非事实 | as if he were related 用 were 表示与事实不符的比喻，“仿佛”并非真的相关 | as if he were related to 用 were 表示非真实的比喻，即「仿佛他和……有亲缘关系」 | as if he were related 用 were，表示只是比喻，并非事实 |
| **定语从句** | that register earthquakes 修饰 machines，register 是从句谓语「记录」 ⚠️ | that register earthquakes ten thousand miles away 修饰 machines，that 在从句中作主语 | that register earthquakes … away 修饰 machines，即「能记录一万英里以外地震的」 | that register earthquakes 修饰 machines，register 意为“记录” ⚠️ |

⚠️ 表示有问题，见下表。

### 问题和亮点

| | 亮点 | 问题 |
|---|---|---|
| **A** | 「先下定义再得结论」把 if…then 的逻辑讲透了 | 顺带解释了 register 的词义，擦着「不解释单个词的意思」的边 |
| **B** | 讲得最完整，比如「that 在从句中作主语」「there be 句型」 | **把 if 讲成了「既然如此」，这是错的：**if 是假设，「既然」是因果 |
| **C** | **每条要点都用「」指出对应的译文片段**，读者能把英文结构和中文一一对上 | 每条更长，抽屉更容易出现滚动 |
| **D** | 最简洁 | 直接写「register 意为“记录”」，违反「不解释单个词的意思」 |

### 共同的遗漏

- 四个都没有借「前一句」点明 him 指的是盖茨比。这一句里「他」已经很清楚，可以接受；但在 it、this 这类指代更模糊的句子里，这条规则需要写得更强。

## 4. 格式和长度

| | 格式合规 | 要点数 | 最长一条说明 | 标签在推荐列表里 |
|---|---|---|---|---|
| **A** | ✅ | 5 | 约 50 字 | 「虚拟语气」不在列表（允许「优先」以外的标签） |
| **B** | ✅ | 5 | 约 55 字 | 同上 |
| **C** | ✅ | 5 | 约 60 字（贴近上限） | 「虚拟」 |
| **D** | ✅ | 5 | 约 40 字 | 「虚拟语气」 |

四个都严格按「译文 / 句型 / 标签｜说明」的格式输出，没有开场白、编号或 Markdown，现在的解析器都能读。

## 5. 结论

| | 译文质量 | 语法讲解 | 对学习的帮助 | 总评 |
|---|---|---|---|---|
| **A** | ★★★★ | ★★★★ | ★★★ | 稳，但普通 |
| **B** | ★★★（有偏离） | ★★★（有错误） | ★★★ | 规则多反而带出问题 |
| **C** | ★★★（略生硬） | ★★★★ | ★★★★★ | 最适合「对照着读懂原句」 |
| **D** | ★★★★★ | ★★★（违规） | ★★★ | 译文最好，讲解最省 |

**建议写第 5 版 prompt，用「C 的结构 + 收紧后的译文规则」：**

1. **保留 C 的「」对照：**语法要点引用对应的译文片段。这是唯一直接服务于「读懂原句」的设计。
2. **译文要自然，不要贴着结构硬译：**取 A、D 的水准。
3. **加一条防发挥的规则：**比喻和措辞贴近原文，不为求文采改变意思（避免 B 的「息息相通」）。
4. **加一条量词和距离的规则：**按中文习惯表达，例如「万里之外」，不要逐字译（避免 C 的「一万英里」）。
5. **把「不解释单个词」写具体：**明确「不要写『X 意为……』」（A、D 都犯了）。
6. **给逻辑词一条提示：**if 是假设，不要讲成「既然」这类因果（避免 B 的错误）。

写好第 5 版后，先用子代理跑同一句，并多加 1–2 个不同类型的句子（比如对话句、含 it 指代的句子）。最后再用 DeepSeek Flash 抽查。

---

## 6. 第 5 版（E）的测试结果（2026-09-30）

E = C 的「」对照 + 收紧后的译文规则，原文见 `scripts/prompt-lab/prompts.ts` 里的 `E`。它已经作为 prompt v3 放进 app（`src/core/grammar/prompt.ts`）。

测试方法和上面相同：每句交给一个独立的子代理（Claude），各跑 1 次。这次除了原来的长句，又加了两句不同类型的句子。

### 句 1：原来的长句（42 个词）

```text
译文：如果说人格是一连串不间断的成功姿态，那么他身上就有某种华美的东西，一种对人生种种希望的高度敏感，仿佛他与那些能记录万里之外地震的精密仪器相连。
句型：条件从句 + there be 主句 + as if 从句
主干｜there was something gorgeous about him，即「他身上就有某种华美的东西」，there be 句型，him 指盖茨比
状语从句｜If personality is … gestures 是假设条件，即「如果说人格是……」，then 引出主句的推论
同位语｜some heightened sensitivity to the promises of life 进一步说明 something gorgeous，即「一种对人生种种希望的高度敏感」
状语从句｜as if he were related to 用虚拟语气 were，即「仿佛他与……相连」，表示比喻而非事实
定语从句｜that register earthquakes 修饰 machines，即「能记录万里之外地震的」
```

### 句 2：拆开的对话引语（25 个词）

前一句：In my younger and more vulnerable years my father gave me some advice that I've been turning over in my mind ever since.

```text
译文：“每当你想批评别人的时候，”他对我说，“就记住，这世上并不是所有人都有过你拥有的那些优越条件。”
句型：直接引语：祈使句 + 状语从句 + 宾语从句
主干｜he told me 插在引语中间，即「他对我说」；引语主干是祈使句 just remember，即「就记住」
状语从句｜Whenever you feel like criticizing anyone 表时间，即「每当你想批评别人的时候」，feel like 后接动名词
宾语从句｜that all the people in this world 引出 remember 的宾语，即「这世上……」整个要记住的内容
部分否定｜all the people … haven't had 是部分否定，即「并不是所有人都有过」，不是「所有人都没有」
定语从句｜that you've had 修饰 advantages，即「你拥有的那些优越条件」，that 作 had 的宾语
```

### 句 3：插入语 + 指代（34 个词）

前一句：Reserving judgements is a matter of infinite hope.

```text
译文：我至今仍有点担心，要是忘了这一点就会错过什么：正如我父亲曾势利地暗示过、我也势利地重复的那样，对基本礼义的感知，生来就分配不均。
句型：主句 + if 条件状语从句 + 宾语从句（含插入语）
主干｜I am still a little afraid of missing something，即「我至今仍有点担心会错过什么」，afraid of 后接动名词作宾语
状语从句｜if I forget that 表示假设条件，即「要是忘了这一点」，说明在什么情况下会错过
宾语从句｜that … a sense of … is parcelled out 作 forget 的宾语，即「对基本礼义的感知……分配不均」
插入语｜as my father snobbishly suggested 插在 that 和从句主语之间，即「正如我父亲曾势利地暗示过的那样」，去掉后结构完整
语态｜is parcelled out unequally at birth 是被动语态，即「生来就分配不均」，强调这种感知是被分给人的
```

### 对照第 5 版的六条改进目标

| 目标 | 结果 |
|---|---|
| 要点用「」对上译文 | ✅ 三句的每条要点都做到了 |
| 译文自然，不贴结构硬译 | ✅ 「万里之外」、对话的引号和语序都很自然 |
| 不为文采改变意思 | ⚠️ 句 1 把 related to 译成「相连」，比「有亲缘」弱一点，但没有「息息相通」那样的发挥 |
| 不解释单个词 | ✅ 没有再出现「X 意为……」 |
| if 讲成假设 | ✅ 句 1、句 3 都写成「假设条件」 |
| 用前一句判断指代 | ✅ 句 1 主动点明「him 指盖茨比」 |

**意外的亮点：**句 2 抓出了 all … haven't 的**部分否定**（「并不是所有人都」），这是中国读者最容易读错的地方。

**还有一处不一致：**句 3 的 that 其实是引出宾语从句的连词，第 3 条要点也讲对了；但译文和第 2 条要点把它当成了代词「这一点」。读者不太会因此误解，暂不改 prompt。等 DeepSeek 实测时继续观察这类 that。

**结论：**E 在三类句子上都达到了目标，已作为 prompt v3 上线到 app 代码里（尚未发布）。下一步是用 DeepSeek Flash 实测几句，确认它也能遵守这些规则。
