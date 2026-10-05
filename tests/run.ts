/**
 * Core logic tests. Run with: npm test
 *
 * These exercise the deterministic layer only — no network, no Obsidian.
 * The point is to prove the invariants that the safety claims rest on:
 *   1. validateNav catches each of the five failure modes.
 *   2. applyInserts and stripAdded are exact inverses, so "the note body was
 *      not modified" is a checkable statement rather than a promise.
 *   3. shouldSplitHeadings fires on a long flat note and stays quiet on a
 *      short one — and does so for English notes, not just CJK ones.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	analyzeStructure,
	applyInserts,
	parseLinks,
	shouldSplitHeadings,
	stripAdded,
	stripNavBlock,
	validateNav,
	visualWidth,
	widthLimitFor,
} from "../src/core";
import { parseModelOutput } from "../src/parse";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = ""): void {
	if (cond) {
		passed++;
		console.log(`  PASS  ${name}`);
	} else {
		failed++;
		console.log(`  FAIL  ${name}${detail ? "  — " + detail : ""}`);
	}
}

function eq(name: string, actual: unknown, expected: unknown): void {
	check(name, actual === expected, `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

const fixtures = join(__dirname, "fixtures");
const wellSectioned = readFileSync(join(fixtures, "well-sectioned.md"), "utf-8");
const flatLong = readFileSync(join(fixtures, "flat-long.md"), "utf-8");
const tooShort = readFileSync(join(fixtures, "too-short.md"), "utf-8");

// ---------------------------------------------------------------- width
console.log("\n=== visualWidth ===");
eq("中文按 2 计", visualWidth("中文"), 4);
eq("英文按 1 计", visualWidth("abc"), 3);
eq("中英混排", visualWidth("Prompt 中文"), 11);
eq("空串", visualWidth(""), 0);

// ------------------------------------------------------ width limit
console.log("\n=== 宽度上限按语言浮动 ===");
eq("中文笔记 → 70", widthLimitFor("这是一篇中文笔记，内容相当多"), 70);
eq(
	"英文笔记 → 120",
	widthLimitFor("This is an English note with plenty of text in it"),
	120
);
eq(
	"中英混排偏向中文 → 70",
	widthLimitFor("Prompt Engineering 是提示词工程，它很重要"),
	70
);
check(
	"英文条目在 120 上限下通过",
	validateNav(
		"> [!abstract] 导航\n> - [[#Section A|Testing after re-reading exposes the gap immediately, which is why it is uncomfortable]]\n",
		"# Top\n\n## Section A\n\nBody text here.\n",
		40,
		widthLimitFor("This is an English note")
	).ok
);

// -------------------------------------------------------- structure
console.log("\n=== 结构分析 ===");
const sWell = analyzeStructure(wellSectioned);
check("well-sectioned 有 H2", (sWell.headingCounts[2] ?? 0) > 0);
check("well-sectioned 不需要补切", !shouldSplitHeadings(sWell));

const sFlat = analyzeStructure(flatLong);
eq("flat-long 没有 H2", sFlat.headingCounts[2] ?? 0, 0);
check(
	"flat-long 触发补切（英文长文）",
	shouldSplitHeadings(sFlat),
	`bodyWidth=${sFlat.bodyWidth}`
);

const sShort = analyzeStructure(tooShort);
check("too-short 不补切", !shouldSplitHeadings(sShort), `bodyWidth=${sShort.bodyWidth}`);

// ------------------------------------------------------------ validate
console.log("\n=== 校验五种失败模式 ===");
const note = "# Top\n\n## Section A\n\nBody text here.\n";
const goodNav =
	"> [!abstract] 导航\n> **一、Section A**\n> - [[#Section A|这条知识点描述得足够具体，可以单独读懂]]\n";
const rGood = validateNav(goodNav, note, 40, 70);
check("正常导航通过", rGood.ok, JSON.stringify(rGood.problems));

const rMissing = validateNav(
	"> [!abstract] 导航\n> - [[#不存在的标题|这条锚点在正文里找不到]]\n",
	note,
	40,
	70
);
check("失效锚点被判失败", !rMissing.ok);
check(
	"报告点名失效锚点",
	rMissing.problems.some((p) => p.includes("锚点失效"))
);

const rEcho = validateNav(
	"> [!abstract] 导航\n> - [[#Section A|Section A]]\n",
	note,
	40,
	70
);
check("标题复述被判失败", !rEcho.ok);

const rNarrow = validateNav(
	"> [!abstract] 导航\n> - [[#Section A|短]]\n",
	note,
	40,
	70
);
check("纯标签被判失败", !rNarrow.ok);

const rOver = validateNav(goodNav, note, 40, 20);
check("超宽被判失败", !rOver.ok);

const rCap = validateNav(
	"> [!abstract] 导航\n" +
		Array.from({ length: 5 }, () => "> - [[#Section A|一条足够长的知识点描述文字]]").join("\n"),
	note,
	3,
	70
);
check("超条目上限被判失败", !rCap.ok);

// -------------------------------------------------- insert/strip inverse
console.log("\n=== 补切与剥离互为逆运算（关键不变量） ===");
const inserts = [
	{ line: 5, title: "## Part One" },
	{ line: 20, title: "## Part Two" },
];
const withInserts = applyInserts(flatLong, inserts);
check("补切后确实变长", withInserts.length > flatLong.length);

const navPrefix = "> [!abstract] 导航\n> - [[#Part One|占位知识点文字足够长]]\n\n";
const restored = stripAdded(navPrefix + withInserts, flatLong);
check(
	"剥离后与原文逐字节相同",
	restored === flatLong,
	`len ${restored.length} vs ${flatLong.length}`
);

// 幂等性：对已含导航的笔记再跑一次，应还原到同一正文
const stripped = stripNavBlock(navPrefix + flatLong);
eq("stripNavBlock 还原原文", stripped, flatLong);

// ---------------------------------------------------------------- parse
console.log("\n=== 解析模型输出 ===");
const raw = `<<<NAV>>>
> [!abstract] 导航
> **一、Section A**
> - [[#Section A|这条知识点描述得足够具体]]
<<<END>>>

<<<INSERTS>>>
5 | ## Part One
20 | ## Part Two
<<<END>>>`;
const parsed = parseModelOutput(raw);
check("解析出导航块", parsed.nav.includes("abstract"));
eq("解析出 2 个补切标题", parsed.inserts.length, 2);
eq("补切行号正确", parsed.inserts[0].line, 5);

const rawNoInserts = `<<<NAV>>>
> [!abstract] 导航
> - [[#Section A|知识点]]
<<<END>>>

<<<INSERTS>>>
<<<END>>>`;
const parsedNoInserts = parseModelOutput(rawNoInserts);
eq("空 INSERTS 块解析为 0 条", parsedNoInserts.inserts.length, 0);

// 容错：模型加了前言
const rawWithPreamble = `好的，我来生成导航：

<<<NAV>>>
> [!abstract] 导航
> - [[#Section A|知识点]]
<<<END>>>`;
const parsedPreamble = parseModelOutput(rawWithPreamble);
check("容忍前言", parsedPreamble.nav.includes("abstract"));

// 缺少结束标记时也应可解析
const rawNoEnd = `<<<NAV>>>
> [!abstract] 导航
> - [[#Section A|知识点]]`;
const parsedNoEnd = parseModelOutput(rawNoEnd);
check("容忍缺少结束标记", parseLinks(parsedNoEnd.nav).length === 1);

// ---------------------------------------------------------------- summary
console.log(`\n${"=".repeat(50)}`);
console.log(`结果: ${passed} 通过, ${failed} 失败`);
console.log("=".repeat(50));
process.exit(failed === 0 ? 0 : 1);
