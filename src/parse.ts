/**
 * Parse the model's delimiter-block output into structured data.
 *
 * The prompt asks for two blocks. Being tolerant here matters: a model that
 * adds a sentence of preamble, or omits the trailing delimiter, should still
 * produce something usable rather than an error the user cannot act on.
 */

import { BLOCK_END, INSERTS_BLOCK_START, NAV_BLOCK_START } from "./prompt";
import { GenerationResult, HeadingInsert } from "./types";

export class ParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ParseError";
	}
}

/** Slice out the text between two delimiters. Missing end → take the rest. */
function extractBlock(raw: string, start: string, end: string): string | null {
	const i = raw.indexOf(start);
	if (i === -1) return null;
	const from = i + start.length;
	const j = raw.indexOf(end, from);
	return (j === -1 ? raw.slice(from) : raw.slice(from, j)).trim();
}

/** `12 | ## Some heading` → { line: 12, title: "## Some heading" } */
function parseInsertLine(line: string): HeadingInsert | null {
	const t = line.trim();
	if (t === "") return null;
	const m = /^(\d+)\s*[|｜]\s*(#{1,6}\s+.+)$/.exec(t);
	if (!m) return null;
	const lineNo = Number.parseInt(m[1], 10);
	if (!Number.isFinite(lineNo) || lineNo < 1) return null;
	return { line: lineNo, title: m[2].trim() };
}

export function parseModelOutput(raw: string): GenerationResult {
	const nav = extractBlock(raw, NAV_BLOCK_START, BLOCK_END);
	if (nav === null || nav === "") {
		throw new ParseError(
			"模型输出里找不到导航块（应以 <<<NAV>>> 开头）。可尝试重新生成。"
		);
	}

	const insertsRaw = extractBlock(raw, INSERTS_BLOCK_START, BLOCK_END);
	const inserts: HeadingInsert[] = [];
	if (insertsRaw) {
		for (const line of insertsRaw.split("\n")) {
			const ins = parseInsertLine(line);
			if (ins) inserts.push(ins);
		}
	}

	return { nav, inserts };
}
