/**
 * Settings tab.
 *
 * The API key is stored in the plugin's `data.json` inside the vault, in plain
 * text — that is the Obsidian convention and it is disclosed in the README.
 * It never leaves the machine except as an Authorization header to the endpoint
 * the user configured.
 */

import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { testConnection } from "./llm";
import type KnowledgeNavPlugin from "./main";

export class KnowledgeNavSettingTab extends PluginSettingTab {
	private readonly plugin: KnowledgeNavPlugin;

	constructor(app: App, plugin: KnowledgeNavPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ---- 模型服务 ----
		new Setting(containerEl).setName("模型服务").setHeading();

		new Setting(containerEl)
			.setName("API 地址")
			.setDesc(
				"任何 OpenAI 兼容的 endpoint。示例：https://api.deepseek.com/v1、" +
					"https://api.moonshot.cn/v1、http://localhost:11434/v1（Ollama）。"
			)
			.addText((t) =>
				t
					.setPlaceholder("https://api.deepseek.com/v1")
					.setValue(this.plugin.settings.apiBaseUrl)
					.onChange(async (v) => {
						this.plugin.settings.apiBaseUrl = v.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("API Key")
			.setDesc(
				"保存在本 vault 的插件数据文件里（明文），与 Obsidian 其他插件的做法一致。" +
					"只会作为 Authorization 头发给你上面填的地址。"
			)
			.addText((t) => {
				t.inputEl.type = "password";
				t.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (v) => {
						this.plugin.settings.apiKey = v.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("模型名称")
			.setDesc("例如 deepseek-chat、kimi-k2-0905-preview、qwen2.5:14b。")
			.addText((t) =>
				t
					.setPlaceholder("deepseek-chat")
					.setValue(this.plugin.settings.model)
					.onChange(async (v) => {
						this.plugin.settings.model = v.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("测试连接")
			.setDesc("发一条最小请求，确认地址、密钥、模型名三者都对得上。")
			.addButton((b) =>
				b.setButtonText("测试").onClick(async () => {
					b.setDisabled(true);
					b.setButtonText("测试中…");
					try {
						const reply = await testConnection(this.plugin.settings);
						new Notice(`连接正常，模型回复：${reply}`);
					} catch (e) {
						new Notice(`连接失败：${(e as Error).message}`, 8000);
					} finally {
						b.setDisabled(false);
						b.setButtonText("测试");
					}
				})
			);

		// ---- 导航规则 ----
		new Setting(containerEl).setName("导航规则").setHeading();

		new Setting(containerEl)
			.setName("条目上限")
			.setDesc(
				"一篇笔记最多生成多少条导航。超限时模型会被要求合并。" +
					"参考值 40：约等于一篇 3000 字笔记的知识点密度。"
			)
			.addText((t) => {
				t.inputEl.type = "number";
				t.setValue(String(this.plugin.settings.maxItems)).onChange(
					async (v) => {
						const n = Number.parseInt(v, 10);
						if (Number.isFinite(n) && n > 0) {
							this.plugin.settings.maxItems = n;
							await this.plugin.saveSettings();
						}
					}
				);
			});

		new Setting(containerEl)
			.setName("单条宽度上限")
			.setDesc(
				"按视觉宽度算：中文 2，英文数字 1。默认 70 ≈ 35 个中文字。" +
					"这是为了悬停预览时不被截断。"
			)
			.addText((t) => {
				t.inputEl.type = "number";
				t.setValue(String(this.plugin.settings.maxWidth)).onChange(
					async (v) => {
						const n = Number.parseInt(v, 10);
						if (Number.isFinite(n) && n > 0) {
							this.plugin.settings.maxWidth = n;
							await this.plugin.saveSettings();
						}
					}
				);
			});

		new Setting(containerEl)
			.setName("允许补切标题")
			.setDesc(
				"笔记很长但几乎没有子标题时，允许模型补切 ## 标题，否则导航无处可指。" +
					"补切只插标题行，不改一个字原文，且写入后可自证。关掉则只用已有标题。"
			)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.allowHeadingInsert).onChange(async (v) => {
					this.plugin.settings.allowHeadingInsert = v;
					await this.plugin.saveSettings();
				})
			);

		// ---- 写入 ----
		new Setting(containerEl).setName("写入").setHeading();

		new Setting(containerEl)
			.setName("写入前备份")
			.setDesc("强烈建议保持开启。备份是唯一能兜住「模型给了一坨烂结果」的东西。")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.autoBackup).onChange(async (v) => {
					this.plugin.settings.autoBackup = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("备份目录")
			.setDesc("vault 内的相对路径。目录不存在会自动创建。")
			.addText((t) =>
				t
					.setPlaceholder("_backup")
					.setValue(this.plugin.settings.backupFolder)
					.onChange(async (v) => {
						this.plugin.settings.backupFolder = v.trim() || "_backup";
						await this.plugin.saveSettings();
					})
			);

		// ---- 高级 ----
		new Setting(containerEl).setName("高级").setHeading();

		new Setting(containerEl)
			.setName("附加指令")
			.setDesc(
				"追加到系统提示词末尾，用来微调风格，例如「专有名词一律保留英文原文」。" +
					"留空即可。"
			)
			.addTextArea((t) => {
				t.setPlaceholder("（可选）")
					.setValue(this.plugin.settings.extraInstructions)
					.onChange(async (v) => {
						this.plugin.settings.extraInstructions = v;
						await this.plugin.saveSettings();
					});
				t.inputEl.rows = 3;
				t.inputEl.style.width = "100%";
			});
	}
}
