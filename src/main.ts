/**
 * Knowledge Nav — plugin entry point.
 *
 * Flow: read note → analyse structure → ask the model → parse → validate →
 * preview → write. Nothing reaches the vault before the preview is accepted.
 */

import { Notice, Plugin, TFile } from "obsidian";
import {
	analyzeStructure,
	applyInserts,
	composeNote,
	shouldSplitHeadings,
	stripNavBlock,
	validateNav,
	widthLimitFor,
} from "./core";
import { generateNavigation } from "./llm";
import { parseModelOutput } from "./parse";
import { NavPreviewModal } from "./preview";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import { KnowledgeNavSettingTab } from "./settings";
import { DEFAULT_SETTINGS, GenerationResult, KnowledgeNavSettings, LIMITS } from "./types";

export default class KnowledgeNavPlugin extends Plugin {
	settings: KnowledgeNavSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new KnowledgeNavSettingTab(this.app, this));

		this.addCommand({
			id: "generate-nav",
			name: "为当前笔记生成导航",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) void this.run(file);
				return true;
			},
		});
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<KnowledgeNavSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Generate a nav block for `file` and show the preview. */
	private async run(file: TFile): Promise<void> {
		const original = await this.app.vault.read(file);

		// Idempotent: strip any nav block we wrote before, so line numbers the
		// model sees match the note it is reasoning about.
		const base = stripNavBlock(original);
		const structure = analyzeStructure(base);

		if (base.trim() === "") {
			new Notice("这篇笔记是空的，没什么可导航。");
			return;
		}

		// Too short to need a nav block, and with no subheadings the model has
		// nothing valid to anchor to — it invents slugs instead. Skip early.
		if (structure.bodyWidth < LIMITS.minBodyWidthForNav) {
			new Notice(
				`这篇笔记太短（正文约 ${Math.round(structure.bodyWidth / 2)} 字），` +
					"一眼能看完，加导航反而添乱。已跳过。"
			);
			return;
		}

		const allowSplit =
			this.settings.allowHeadingInsert && shouldSplitHeadings(structure);

		// Latin notes need a wider limit — see LIMITS.latinMaxWidth.
		const widthLimit = widthLimitFor(base);

		const system =
			buildSystemPrompt(this.settings, allowSplit, widthLimit) +
			(this.settings.extraInstructions.trim()
				? `\n\n# 附加指令\n\n${this.settings.extraInstructions.trim()}`
				: "");
		const user = buildUserPrompt(base, structure);

		const notice = new Notice("正在生成导航…", 0);
		let raw: string;
		try {
			raw = await generateNavigation(this.settings, system, user);
		} catch (e) {
			notice.hide();
			new Notice(`生成失败：${(e as Error).message}`, 8000);
			return;
		}
		notice.hide();

		let result: GenerationResult;
		try {
			result = parseModelOutput(raw);
		} catch (e) {
			new Notice((e as Error).message, 8000);
			return;
		}

		// Validate against the body the nav will actually point into — the
		// inserted headings are anchors too, so they must exist at check time.
		const body = result.inserts.length
			? applyInserts(base, result.inserts)
			: base;
		const report = validateNav(
			result.nav,
			body,
			this.settings.maxItems,
			widthLimit
		);

		const backupPath = this.backupPathFor(file);
		const modal = new NavPreviewModal(this.app, {
			nav: result.nav,
			inserts: result.inserts,
			report,
			willBackup: this.settings.autoBackup,
			backupPath,
			onApply: () => this.apply(file, original, result, body),
			onRegenerate: async () => {
				modal.close();
				await this.run(file);
			},
		});
		modal.open();
	}

	/** Back up, then write the composed note. */
	private async apply(
		file: TFile,
		original: string,
		result: GenerationResult,
		body: string
	): Promise<void> {
		if (this.settings.autoBackup) {
			try {
				await this.writeBackup(file, original);
			} catch (e) {
				new Notice(`备份失败，已中止写入：${(e as Error).message}`, 8000);
				return;
			}
		}

		const final = composeNote(result.nav, body);
		await this.app.vault.modify(file, final);

		new Notice(
			result.inserts.length
				? `导航已写入，并插入 ${result.inserts.length} 个标题。`
				: "导航已写入。"
		);
	}

	private backupPathFor(file: TFile): string {
		const folder = this.settings.backupFolder.replace(/^\/+|\/+$/g, "") || "_backup";
		return `${folder}/${file.basename}.${timestamp()}.md`;
	}

	private async writeBackup(file: TFile, content: string): Promise<void> {
		const folder = this.settings.backupFolder.replace(/^\/+|\/+$/g, "") || "_backup";
		if (!(await this.app.vault.adapter.exists(folder))) {
			await this.app.vault.createFolder(folder);
		}
		let path = this.backupPathFor(file);
		let n = 2;
		while (await this.app.vault.adapter.exists(path)) {
			path = this.backupPathFor(file).replace(/\.md$/, `-${n}.md`);
			n++;
		}
		await this.app.vault.create(path, content);
	}
}

/** Local time, `YYYYMMDD-HHmmss`. */
function timestamp(): string {
	const d = new Date();
	const p = (n: number, w = 2) => String(n).padStart(w, "0");
	return (
		`${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
		`-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
	);
}
