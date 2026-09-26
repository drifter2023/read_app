/** One sentence's grammar notes: the overall pattern, then labelled points. */
export interface Grammar { pattern: string; points: { label: string; text: string }[] }

/**
 * Hand-written notes for the opening sentences of the bundled books. A placeholder until real
 * grammar analysis exists; every other sentence shows the "coming soon" state.
 * Keyed by `bookId:chapter/para/sentence`.
 */
const SAMPLES: Record<string, Grammar> = {
  'gatsby:0/0/0': {
    pattern: '主句 + 定语从句',
    points: [
      { label: '主干', text: 'my father gave me some advice。give 带双宾语：me 是间接宾语，some advice 是直接宾语。' },
      { label: '状语', text: 'In my younger and more vulnerable years 放在句首表时间；younger 和 more vulnerable 是两个并列的比较级。' },
      { label: '定语从句', text: 'that I’ve been turning over in my mind ever since 修饰 advice；that 在从句里作 turning over 的宾语。' },
      { label: '时态', text: 'I’ve been turning over … ever since 是现在完成进行时：从那时起一直在反复琢磨，至今仍在继续。' },
    ],
  },
  'gatsby:0/1/0': {
    pattern: '直接引语 + 状语从句 + 宾语从句 + 定语从句',
    points: [
      { label: '插入语', text: 'he told me 把引语拆成前后两段，是小说里常见的写法。' },
      { label: '状语从句', text: 'Whenever you feel like criticizing anyone：whenever 意为“每当”；feel like 后接动名词，表示“想要做”。' },
      { label: '祈使句', text: 'just remember that … 省略了主语 you；that 引导 remember 的宾语从句。' },
      { label: '定语从句', text: 'that you’ve had 修饰 the advantages。两处现在完成时都强调“到目前为止拥有的条件”。' },
    ],
  },
  'gatsby:0/2/0': {
    pattern: '三个并列分句（but / and）',
    points: [
      { label: '并列', text: 'He didn’t say any more, but we’ve always been …, and I understood … 三个独立分句由 but 和 and 连接。' },
      { label: '修辞', text: 'unusually communicative in a reserved way 是矛盾修辞：以含蓄的方式格外能沟通，也就是“心照不宣”。' },
      { label: '宾语从句', text: 'that he meant a great deal more than that：a great deal 修饰比较级 more，意为“多得多”；句末的 that 指他说出口的话。' },
      { label: '时态', text: 'we’ve always been 用现在完成时，表示一直如此。' },
    ],
  },
  'farewell:0/0/0': {
    pattern: '简单句 + 定语从句',
    points: [
      { label: '主干', text: 'we lived in a house：主语 + 谓语 + 地点状语。' },
      { label: '状语', text: 'In the late summer of that year 放在句首表时间。' },
      { label: '地点叠加', text: 'in a house in a village 由小到大连续定位，是海明威常见的节奏。' },
      { label: '定语从句', text: 'that looked across the river and the plain to the mountains 修饰 a village；look across … to … 意为“越过……望向……”。' },
    ],
  },
  'farewell:0/0/1': {
    pattern: 'There be 句型 + 并列句',
    points: [
      { label: 'There be', text: 'there were pebbles and boulders 表示“某处有某物”；地点 In the bed of the river 提到了句首。' },
      { label: '补充说明', text: 'dry and white in the sun 是形容词短语，补充描写 pebbles and boulders。' },
      { label: '并列表语', text: 'the water was clear and swiftly moving and blue：用 and 反复连接多个表语，是海明威的复沓风格。' },
    ],
  },
  'farewell:0/0/2': {
    pattern: '两个并列分句 + 省略关系词的定语从句',
    points: [
      { label: '并列', text: 'Troops went by the house and down the road 与 the dust … powdered the leaves 由 and 连接。' },
      { label: '定语从句', text: 'they raised 修饰 the dust，省略了关系代词 that / which；它在从句中作宾语，所以可以省略。' },
      { label: '词性转换', text: 'powder 本是名词“粉末”，这里作动词：给……蒙上一层粉。' },
    ],
  },
  'falcon:0/0/0': {
    pattern: '主系表 + 独立主格结构',
    points: [
      { label: '主干', text: 'Samuel Spade’s jaw was long and bony：系动词 was + 两个并列形容词作表语。' },
      { label: '独立主格', text: 'his chin a jutting v … 省略了系动词，带有自己的逻辑主语 his chin，作伴随描写。' },
      { label: '比喻', text: 'v 指字母 V 的形状，下文会反复出现；a jutting v 即“突出的 V 形”。' },
    ],
  },
  'falcon:0/0/1': {
    pattern: '简单句 + 表结果的不定式',
    points: [
      { label: '主干', text: 'His nostrils curved back：curve 在这里是不及物动词，“弯曲”。' },
      { label: '不定式', text: 'to make another, smaller, v 表结果：弯回去，形成另一个 V。' },
      { label: '标点', text: 'smaller 两边的逗号把它变成补充说明，读起来像作者停顿了一下再补上一句。' },
    ],
  },
  'falcon:0/0/2': {
    pattern: '主系表（简单句）',
    points: [
      { label: '主干', text: '主语 His yellow-grey eyes + 系动词 were + 表语 horizontal。' },
      { label: '复合形容词', text: 'yellow-grey 用连字符把两个颜色合成一个形容词，“黄灰色的”。' },
      { label: '语义', text: 'horizontal 形容眼睛是“平直的”，和前面的一串 V 形成对比。' },
    ],
  },
};

export function grammarFor(bookId: string, chapter: number, para: number, sentence: number): Grammar | null {
  return SAMPLES[`${bookId}:${chapter}/${para}/${sentence}`] ?? null;
}
