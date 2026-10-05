/**
 * End-to-end test: real LLM call → parse → validate.
 *
 * Run with:  KN_KEY=<key> npm run e2e
 *
 * This is the one thing unit tests cannot cover — whether a real model,
 * given the real prompt, produces output the parser and validator accept.
 *
 * Uses global fetch rather than the plugin's `requestUrl`, because that API
 * only exists inside Obsidian.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	analyzeStructure,
	applyInserts,
	shouldSplitHeadings,
	validateNav,
	widthLimitFor,
} from "../src/core";
import { parseModelOutput } from "../src/parse";
import { buildSystemPrompt, buildUserPrompt } from "../src/prompt";
import { DEFAULT_SETTINGS } from "../src/types";

const KEY = process.env.KN_KEY ?? "";
if (KEY === "") {
	console.error("缺少 KN_KEY 环境变量。用法: KN_KEY=xxx npm run e2e");
	process.exit(2);
}

const settings = {
	...DEFAULT_SETTINGS,
	apiBaseUrl: process.env.KN_BASE ?? "https://open.bigmodel.cn/api/paas/v4",
	model: process.env.KN_MODEL ?? "glm-4.7-flash",
	apiKey: KEY,
};

/** Retry on 1305 — Zhipu's "model is overloaded" code for the free tier. */
async function callModel(system: string, user: string): Promise<string> {
	const url = `${settings.apiBaseUrl}/chat/completions`;
	const body = JSON.stringify({
		model: settings.model,
		messages: [
			{ role: "system", content: system },
			{ role: "user", content: user },
		],
		temperature: 0.2,
		stream: false,
	});

	const maxAttempts = 5;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const started = Date.now();
		const res = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${KEY}`,
			},
			body,
		});
		const text = await res.text();
		let json: any = null;
		try {
			json = JSON.parse(text);
		} catch {
			/* fall through to the error below */
		}

		if (res.ok) {
			const elapsed = ((Date.now() - started) / 1000).toFixed(1);
			console.log(`    HTTP 200 · ${elapsed}s`);
			return json?.choices?.[0]?.message?.content ?? "";
		}

		const code = json?.error?.code;
		const msg = json?.error?.message ?? text.slice(0, 200);
		// 1305 = model overloaded; 1302 = account rate limit. Both are
		// transient on the free tier and worth waiting out.
		if ((code === "1305" || code === "1302") && attempt < maxAttempts) {
			console.log(`    限流(${code})，${attempt}/${maxAttempts} 次，等 20 秒…`);
			await new Promise((r) => setTimeout(r, 20000));
			continue;
		}
		throw new Error(`HTTP ${res.status} [${code}]: ${msg}`);
	}
	throw new Error("重试次数用尽");
}

async function runOne(fileName: string): Promise<boolean> {
	const noteText = readFileSync(join(__dirname, "fixtures", fileName), "utf-8");
	const structure = analyzeStructure(noteText);
	const allowSplit = shouldSplitHeadings(structure);

	console.log(`\n${"=".repeat(64)}`);
	console.log(`笔记: ${fileName}`);
	console.log(
		`结构: ${structure.totalLines} 行 · H1=${structure.headingCounts[1] ?? 0}` +
			` H2=${structure.headingCounts[2] ?? 0} H3=${structure.headingCounts[3] ?? 0}` +
			` · 正文宽度=${structure.bodyWidth} · 允许补切=${allowSplit}`
	);
	console.log("=".repeat(64));

	const system = buildSystemPrompt(settings, allowSplit, widthLimitFor(noteText));
	const user = buildUserPrompt(noteText, structure);

	console.log("  调用模型…");
	let raw: string;
	try {
		raw = await callModel(system, user);
	} catch (e) {
		console.log(`  ✗ 调用失败: ${(e as Error).message}`);
		return false;
	}

	console.log(`  原始输出 ${raw.length} 字符`);

	let parsed;
	try {
		parsed = parseModelOutput(raw);
	} catch (e) {
		console.log(`  ✗ 解析失败: ${(e as Error).message}`);
		console.log(`  --- 原始输出 ---\n${raw.slice(0, 800)}`);
		return false;
	}
	console.log(`  ✓ 解析成功: ${parsed.inserts.length} 个补切标题`);

	const body = parsed.inserts.length
		? applyInserts(noteText, parsed.inserts)
		: noteText;
	const report = validateNav(
		parsed.nav,
		body,
		settings.maxItems,
		widthLimitFor(noteText)
	);

	console.log("\n  --- 校验报告 ---");
	for (const c of report.checks) {
		console.log(`    ${c.ok ? "PASS" : "FAIL"}  ${c.name}: ${c.detail}`);
	}
	if (report.problems.length) {
		console.log("  --- 问题 ---");
		for (const p of report.problems) console.log(`    · ${p}`);
	}

	console.log("\n  --- 生成的导航块 ---");
	for (const line of parsed.nav.split("\n")) console.log(`    ${line}`);

	if (parsed.inserts.length) {
		console.log("\n  --- 补切标题 ---");
		for (const i of parsed.inserts) console.log(`    第 ${i.line} 行前 → ${i.title}`);
	}

	console.log(`\n  结果: ${report.ok ? "✓ 全部通过" : "✗ 存在失败项"}`);
	return report.ok;
}

async function main(): Promise<void> {
	// KN_FIXTURE runs a single note. The free tier rate-limits fast, so three
	// back-to-back calls will hit 1302 before the third one finishes.
	const only = process.env.KN_FIXTURE;
	const targets = only
		? [only]
		: ["well-sectioned.md", "flat-long.md", "too-short.md"];
	const results: boolean[] = [];
	for (const t of targets) {
		results.push(await runOne(t));
	}
	const ok = results.filter(Boolean).length;
	console.log(`\n${"=".repeat(64)}`);
	console.log(`端到端结果: ${ok}/${results.length} 篇通过校验`);
	console.log("=".repeat(64));
	process.exit(ok === results.length ? 0 : 1);
}

void main();
