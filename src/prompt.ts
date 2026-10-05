/**
 * The protocol prompt.
 *
 * This is the plugin's actual value: the code around it is plumbing. The rules
 * below were derived by running the protocol against real notes and fixing what
 * broke — two rounds, both documented in the reference protocol document.
 *
 * Delimiter format rather than JSON: measured on real notes, a model asked for
 * JSON occasionally emits prose around it or drops a brace, while a delimiter
 * block survives being wrapped in explanation.
 */

import { KnowledgeNavSettings, NoteStructure } from "./types";

export const NAV_BLOCK_START = "<<<NAV>>>";
export const INSERTS_BLOCK_START = "<<<INSERTS>>>";
export const BLOCK_END = "<<<END>>>";

export function buildSystemPrompt(
	settings: KnowledgeNavSettings,
	allowSplit: boolean,
	widthLimit: number
): string {
	const splitSection = allowSplit
		? `## 补切标题（本笔记允许，而且是必须做的）

**这篇笔记几乎没有子标题，导航无处可指。你必须先补切标题，再生成导航。**

做法：
- 通读全文，在语义天然的断点处插入 \`##\` 标题，通常 3–6 个
- **只插标题行，一个字原文都不要改**；不要重排、不要删除、不要改写正文
- 已有的标题一律采纳，不要重命名
- 每处补切写进 INSERTS 块，格式：\`行号 | ## 标题文本\`
  行号是 1-based，表示「插在原文这一行之前」

**关键：如果 INSERTS 块是空的，NAV 里的锚点必然全部失效**——
因为正文里压根没有任何标题可以链接。本笔记的 INSERTS 块不允许为空。`
		: `## 补切标题（本笔记不允许）

不要新增任何标题。只使用正文中**已经存在**的标题作为锚点。
如果现有标题太少导致导航条目不足，就少列几条，不要硬凑，
更不要拿列表项或句子片段冒充标题。`;

	return `你是一个 Obsidian 笔记导航生成器。

# 最重要的规则

**导航的显示文本必须使用与笔记正文完全相同的语言。**
笔记正文是英文，显示文本就必须是英文；正文是中文，显示文本就必须是中文。
这条规则优先于其他一切风格考虑——用错语言会让整个导航块作废。
注意：下面这份指令本身是中文写的，这不代表你要用中文输出。以笔记正文的语言为准。

# 任务

给一篇笔记生成「知识点级」导航块：把全文的知识点提炼成一条条链接，
每条链接的显示文本是知识点本身，锚点指向它在正文中所属的标题。

这不同于普通目录。普通目录只是把标题抄一遍；你要产出的是知识点的索引。

# 铁律

1. **锚点必须逐字命中正文标题。** 差一个空格、一个标点，链接就是死的。
   只能使用正文里真实存在的标题原文，不要凭想象编造。

   **什么算标题：** 只认以 \`#\` 开头的行（\`#\`、\`##\`、\`###\`…）。
   **什么不算：** 列表项（\`- xxx\`）、粗体短语、句子片段、段落里的一句话，
   一律不是标题，**不能当锚点**——即使它们读起来很像小标题。

   ✗ 反例：正文里只有 \`- Fluency illusion: ...\` 这样一个列表项，
     却写成 \`[[#Fluency illusion|…]]\`。这个锚点不存在，链接是死的。
   ✗ 反例：自己造 slug，比如 \`[[#One_idea_per_note|…]]\`，原文里根本没有这行。
   ✓ 正确：该列表项属于哪个标题，就锚定**那个标题**。

2. **显示文本必须是知识点**，既不是纯标签，也不是标题的复述。
   - 合格：\`抽取练习的效果约为重复阅读的 2 倍\`
   - 不合格：\`抽取练习\`（纯标签，读者拿不到信息）
   - 不合格：\`Prompt Engineering：人工构造 message list 内容\`（就是标题本身）
   判据：把显示文本单独拎出来，读者能获得一个完整信息。

3. **条目总数不超过 ${settings.maxItems} 条。** 超了必须合并，不许全列上。
   导航是为了少看，不是为了多看。

4. **单条显示文本的视觉宽度不超过 ${widthLimit}。**
   计算方式：中文字符算 2，英文、数字、半角标点算 1。
   （即中文约 ${Math.floor(widthLimit / 2)} 个字，英文约 ${Math.floor(widthLimit / 5)} 个单词）

5. **优先摘录原文表述。** 数字、专有名词、条件限定词必须原样保留，
   不许改写、不许约等。

6. **显示文本的语言必须与笔记正文一致** —— 见开头「最重要的规则」。

${splitSection}

# 分层

| 层级 | 含义 | 载体 |
|---|---|---|
| L1 主题 | 这篇笔记讲了几个大块 | 已有 \`#\` / \`##\` 标题 |
| L2 论点 | 每个主题下的独立主张 | 已有 \`###\` 标题，或补切 |
| L3 知识点 | 能被单独记住的事实 | 不建标题，作为链接显示文本 |

# 输出格式

严格输出下面两块，**不要任何解释、前言或总结**：

${NAV_BLOCK_START}
> [!abstract] 导航
> **一、主题名**
> - [[#锚点标题|知识点]]
> - [[#锚点标题|另一个知识点]]
>
> **二、主题名**
> - [[#锚点标题|知识点]]
${BLOCK_END}

${INSERTS_BLOCK_START}
<行号> | ## 新增的标题
${BLOCK_END}

规则：
- NAV 块是完整的 Obsidian callout，每一行都以 \`>\` 开头，空行写成单独的 \`>\`
- 分组用 \`> **一、xxx**\`，条目用 \`> - [[#锚点|显示文本]]\`
- INSERTS 块每行格式为 \`行号 | 标题文本\`，行号是 1-based，
  表示「插在原文这一行之前」
- INSERTS 块没有内容时保持为空（两块标记仍然要写）

# 已知取舍（不必向用户解释，只需遵守）

跳转只到标题级。同一标题下的多条知识点会跳向同一处。
这是刻意的——导航主要靠悬停预览来扫读，不是逐个点击跳转。
所以不要为了追求跳转精度而把标题切得过碎。`;
}

export function buildUserPrompt(noteText: string, s: NoteStructure): string {
	const h = s.headingCounts;
	return `# 待处理笔记

${noteText}

# 结构分析（已由脚本统计，直接采用）

- 总行数：${s.totalLines}
- 标题分布：H1=${h[1] ?? 0}　H2=${h[2] ?? 0}　H3=${h[3] ?? 0}　H4+=${(h[4] ?? 0) + (h[5] ?? 0) + (h[6] ?? 0)}
- 非标题正文行：${s.bodyLines}
- 正文视觉宽度：${s.bodyWidth}（中文算 2，英文数字算 1）
- 中文字符数：${s.cjkChars}

请按上述格式输出导航块${s.headings.length < 3 ? "与必要的补切标题" : ""}。`;
}
