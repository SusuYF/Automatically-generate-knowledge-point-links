/**
 * Preview modal.
 *
 * This is the answer to the plugin's biggest risk: an LLM given a note it has
 * never seen may return a poor nav block. Nothing is written to the vault until
 * the user has looked at the result and pressed apply. Every write goes through
 * this screen.
 */

import { App, Modal, Setting } from "obsidian";
import { ValidationReport } from "./types";

export interface PreviewPayload {
	nav: string;
	inserts: { line: number; title: string }[];
	report: ValidationReport;
	/** Whether the note will be backed up before writing. */
	willBackup: boolean;
	backupPath: string;
	onApply: () => Promise<void>;
	onRegenerate: () => Promise<void>;
}

export class NavPreviewModal extends Modal {
	private readonly payload: PreviewPayload;
	private busy = false;

	constructor(app: App, payload: PreviewPayload) {
		super(app);
		this.payload = payload;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("knowledge-nav-preview");

		contentEl.createEl("h2", { text: "导航预览" });

		this.renderReport(contentEl);
		this.renderNav(contentEl);
		this.renderInserts(contentEl);
		this.renderBackupNote(contentEl);
		this.renderButtons(contentEl);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderReport(parent: HTMLElement): void {
		const { report } = this.payload;
		const box = parent.createDiv({ cls: "kn-box" });
		box.createEl("h3", {
			text: report.ok ? "✓ 校验通过" : "✗ 校验未通过",
			cls: report.ok ? "kn-pass" : "kn-fail",
		});

		const table = box.createEl("table", { cls: "kn-table" });
		for (const c of report.checks) {
			const tr = table.createEl("tr");
			tr.createEl("td", { text: c.name });
			tr.createEl("td", { text: c.detail });
			tr.createEl("td", {
				text: c.ok ? "PASS" : "FAIL",
				cls: c.ok ? "kn-pass" : "kn-fail",
			});
		}

		if (report.problems.length > 0) {
			const ul = box.createEl("ul", { cls: "kn-problems" });
			for (const p of report.problems) ul.createEl("li", { text: p });
		}
	}

	private renderNav(parent: HTMLElement): void {
		parent.createEl("h3", {
			text: `导航块（${this.payload.report.links.length} 条）`,
		});
		const pre = parent.createEl("pre", { cls: "kn-code" });
		pre.createEl("code", { text: this.payload.nav });
	}

	private renderInserts(parent: HTMLElement): void {
		const { inserts } = this.payload;
		if (inserts.length === 0) return;
		parent.createEl("h3", { text: `将在正文插入 ${inserts.length} 个标题` });
		const ul = parent.createEl("ul", { cls: "kn-inserts" });
		for (const ins of inserts) {
			ul.createEl("li", { text: `第 ${ins.line} 行前 → ${ins.title}` });
		}
	}

	private renderBackupNote(parent: HTMLElement): void {
		if (!this.payload.willBackup) {
			parent.createEl("p", {
				text: "⚠ 备份已关闭。写入将无法回滚。",
				cls: "kn-fail",
			});
			return;
		}
		parent.createEl("p", {
			text: `写入前会备份到：${this.payload.backupPath}`,
			cls: "kn-muted",
		});
	}

	private renderButtons(parent: HTMLElement): void {
		const bar = parent.createDiv({ cls: "kn-buttons" });

		const regen = bar.createEl("button", { text: "重新生成" });
		regen.addEventListener("click", () => {
			if (this.busy) return;
			void this.payload.onRegenerate();
		});

		const cancel = bar.createEl("button", { text: "取消" });
		cancel.addEventListener("click", () => this.close());

		const apply = bar.createEl("button", {
			text: this.payload.report.ok ? "应用到笔记" : "仍要应用",
			cls: "mod-cta",
		});
		if (!this.payload.report.ok) {
			apply.addClass("kn-warn");
		}
		apply.addEventListener("click", () => {
			if (this.busy) return;
			this.busy = true;
			apply.setText("写入中…");
			apply.setAttribute("disabled", "true");
			void this.payload
				.onApply()
				.then(() => this.close())
				.catch(() => {
					this.busy = false;
					apply.removeAttribute("disabled");
					apply.setText("重试");
				});
		});
	}
}

/** Small helper so settings and the modal share one look. */
export function addDivider(parent: HTMLElement): void {
	new Setting(parent).setName("").setHeading();
}
