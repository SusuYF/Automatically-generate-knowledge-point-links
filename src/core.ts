/**
 * Deterministic core: structure analysis, navigation validation, and the
 * insert/strip pair used to prove the note body was not modified.
 *
 * Ported from the reference implementation `validate_nav.py`.
 *
 * Why this lives in code and not in the prompt: measured twice, the model's
 * own item counts were wrong (reported 40 when there were 43; flagged 6 valid
 * entries as over-width). Anything involving counting, limits or width must be
 * computed, never asked.
 */

import {
	CheckResult,
	HeadingInsert,
	LIMITS,
	NavLink,
	NoteStructure,
	ValidationReport,
} from "./types";

/** First line of a generated nav block. */
export const NAV_HEADER = "> [!abstract]";

/** Visual width: CJK / full-width = 2, everything else = 1. */
export function visualWidth(s: string): number {
	let n = 0;
	for (const ch of s) {
		const cp = ch.codePointAt(0) ?? 0;
		n += cp > 0x2e80 ? 2 : 1;
	}
	return n;
}

/**
 * Entry width limit for a note, chosen by its dominant script.
 *
 * A single limit punishes Latin notes: 70 visual units buys 35 Chinese
 * characters but only ~14 English words, so English entries carrying the same
 * meaning get rejected. See LIMITS.latinMaxWidth for the measurement.
 */
export function widthLimitFor(noteText: string): number {
	const cjk = (noteText.match(/[\u4e00-\u9fff]/g) ?? []).length;
	const nonSpace = noteText.replace(/\s/g, "").length;
	const ratio = cjk / Math.max(nonSpace, 1);
	return ratio > LIMITS.cjkDominantRatio
		? LIMITS.cjkMaxWidth
		: LIMITS.latinMaxWidth;
}

/**
 * Strip punctuation and whitespace so a display text can be compared against
 * its anchor heading. Used by the "echoes the heading" check.
 */
export function stripPunct(s: string): string {
	return s.replace(/[\s：:、，,。；;！!？?（）()\[\]「」『』【】\-—–/\\|]/g, "");
}

/** Extract the callout nav block. Returns null when the note has none. */
export function extractNavBlock(text: string): string | null {
	const lines = text.split("\n");
	let start = -1;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].startsWith(NAV_HEADER)) {
			start = i;
			break;
		}
	}
	if (start === -1) return null;

	const out: string[] = [];
	for (let i = start; i < lines.length; i++) {
		if (lines[i].startsWith(">")) out.push(lines[i]);
		else break;
	}
	return out.join("\n");
}

/** Remove the nav block and the blank line that follows it. */
export function stripNavBlock(text: string): string {
	const lines = text.split("\n");
	let i = 0;
	while (i < lines.length && !lines[i].startsWith(NAV_HEADER)) i++;
	while (i < lines.length && lines[i].startsWith(">")) i++;
	while (i < lines.length && lines[i].trim() === "") i++;
	return lines.slice(i).join("\n");
}

/** All heading texts in the note, with `#` prefixes stripped. */
export function extractHeadings(text: string): string[] {
	const out: string[] = [];
	for (const line of text.split("\n")) {
		const m = /^#{1,6}\s+(.+)$/.exec(line);
		if (m) out.push(m[1].trim());
	}
	return out;
}

/** Parse `[[#anchor|text]]` links out of a nav block. */
export function parseLinks(nav: string): NavLink[] {
	const out: NavLink[] = [];
	const re = /\[\[#([^\]|]+)\|([^\]]+)\]\]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(nav)) !== null) {
		out.push({ anchor: m[1], text: m[2] });
	}
	return out;
}

/** Run the five checks plus the anchor-existence test. */
export function validateNav(
	nav: string,
	noteText: string,
	maxItems: number,
	maxWidth: number
): ValidationReport {
	const links = parseLinks(nav);
	const headings = new Set(extractHeadings(noteText));

	const missing = links.filter((l) => !headings.has(l.anchor));
	const tooWide = links.filter((l) => visualWidth(l.text) > maxWidth);
	const tooNarrow = links.filter((l) => visualWidth(l.text) < LIMITS.minWidth);
	const echo = links.filter((l) => {
		const na = stripPunct(l.anchor);
		const nt = stripPunct(l.text);
		if (na.length === 0) return false;
		return nt.includes(na) && na.length / Math.max(nt.length, 1) > LIMITS.echoRatio;
	});

	const maxSeen = links.length
		? Math.max(...links.map((l) => visualWidth(l.text)))
		: 0;

	const checks: CheckResult[] = [
		{
			name: "条目数",
			detail: `${links.length}/${maxItems}`,
			ok: links.length <= maxItems,
		},
		{
			name: "锚点命中",
			detail: `${links.length - missing.length}/${links.length}`,
			ok: missing.length === 0,
		},
		{
			name: "视觉宽度",
			detail: `max ${maxSeen} ≤ ${maxWidth}`,
			ok: tooWide.length === 0,
		},
		{ name: "标题复述", detail: `${echo.length} 条`, ok: echo.length === 0 },
		{ name: "纯标签", detail: `${tooNarrow.length} 条`, ok: tooNarrow.length === 0 },
	];

	const problems: string[] = [];
	for (const l of missing) {
		problems.push(`锚点失效 → \`${l.anchor}\`（正文无此标题，检查空格/标点差异）`);
	}
	for (const l of tooWide) {
		problems.push(`超宽 ${visualWidth(l.text)} → ${l.text}`);
	}
	for (const l of tooNarrow) {
		problems.push(`过短 ${visualWidth(l.text)} → ${l.text}`);
	}
	for (const l of echo) {
		problems.push(`标题复述 → ${l.text}`);
	}

	return { links, checks, problems, ok: checks.every((c) => c.ok) };
}

/** Measure a note so the split decision can be made deterministically. */
export function analyzeStructure(text: string): NoteStructure {
	const lines = text.split("\n");
	const headings: NoteStructure["headings"] = [];
	const headingCounts: Record<number, number> = {};

	for (let i = 0; i < lines.length; i++) {
		const m = /^(#{1,6})\s+(.+)$/.exec(lines[i]);
		if (!m) continue;
		const level = m[1].length;
		headings.push({ level, text: m[2].trim(), line: i + 1 });
		headingCounts[level] = (headingCounts[level] ?? 0) + 1;
	}

	const bodyLineArr = lines.filter((l) => {
		const t = l.trim();
		return t !== "" && !t.startsWith("#") && !t.startsWith("|");
	});
	const bodyLines = bodyLineArr.length;
	const bodyWidth = bodyLineArr.reduce((sum, l) => sum + visualWidth(l.trim()), 0);
	const cjkChars = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;

	return {
		totalLines: lines.length,
		headings,
		headingCounts,
		bodyLines,
		bodyWidth,
		cjkChars,
		hasNavBlock: extractNavBlock(text) !== null,
	};
}

/**
 * Whether the note needs headings inserted before a nav block can point
 * anywhere. A note that is short, or already well-sectioned, is left alone.
 *
 * Length is measured in visual width rather than character count so that a
 * CJK note and an English note of comparable substance are treated alike.
 */
export function shouldSplitHeadings(s: NoteStructure): boolean {
	if (s.bodyWidth < LIMITS.minCharsForSplit) return false;
	const subheadings = (s.headingCounts[2] ?? 0) + (s.headingCounts[3] ?? 0);
	return subheadings < LIMITS.sparseSubheadingCount;
}

/**
 * Insert headings into the note body. Line numbers refer to the ORIGINAL note,
 * so insertions are applied bottom-up to keep them valid.
 */
export function applyInserts(noteText: string, inserts: HeadingInsert[]): string {
	const lines = noteText.split("\n");
	const sorted = [...inserts].sort((a, b) => b.line - a.line);
	for (const ins of sorted) {
		const idx = Math.max(0, Math.min(ins.line - 1, lines.length));
		lines.splice(idx, 0, ins.title, "");
	}
	return lines.join("\n");
}

/**
 * Undo exactly what the plugin added — the nav block and every heading that
 * was not present in the backup — so the remainder can be compared byte for
 * byte against the backup. This is the safety net for the split feature.
 */
export function stripAdded(text: string, backupText: string): string {
	const bakTitles = new Set(extractHeadings(backupText));
	const lines = text.split("\n");

	let i = 0;
	while (i < lines.length && !lines[i].startsWith(NAV_HEADER)) i++;
	while (i < lines.length && lines[i].startsWith(">")) i++;

	const out: string[] = [];
	while (i < lines.length) {
		const m = /^#{1,6}\s+(.+)$/.exec(lines[i]);
		if (m && !bakTitles.has(m[1].trim())) {
			i++;
			if (i < lines.length && lines[i].trim() === "") i++;
			continue;
		}
		out.push(lines[i]);
		i++;
	}

	while (out.length > 0 && out[0].trim() === "") out.shift();
	return out.join("\n");
}

/** Compose the final note text: nav block on top, body below. */
export function composeNote(nav: string, body: string): string {
	return nav.trimEnd() + "\n\n" + body;
}
