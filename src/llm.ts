/**
 * OpenAI-compatible chat client.
 *
 * Uses Obsidian's `requestUrl` rather than `fetch`: `fetch` runs into CORS on
 * several providers and behaves differently on mobile. `requestUrl` is the
 * documented escape hatch and works on both platforms.
 *
 * Deliberately non-streaming. A nav block is small and arrives in one piece;
 * streaming would add a lot of surface for little gain. If it turns out users
 * want to watch progress, this is the place to change.
 */

import { requestUrl } from "obsidian";

/**
 * Field names match `KnowledgeNavSettings` on purpose, so settings can be
 * passed straight in without a mapping layer.
 */
export interface LlmConfig {
	apiBaseUrl: string;
	apiKey: string;
	model: string;
}

export class LlmError extends Error {
	readonly status?: number;

	constructor(message: string, status?: number) {
		super(message);
		this.name = "LlmError";
		this.status = status;
	}
}

interface ChatResponse {
	choices?: { message?: { content?: string } }[];
	error?: { message?: string };
}

function endpoint(apiBaseUrl: string): string {
	const trimmed = apiBaseUrl.trim().replace(/\/+$/, "");
	if (trimmed === "") {
		throw new LlmError("未配置 API 地址。");
	}
	return `${trimmed}/chat/completions`;
}

function authHeaders(apiKey: string): Record<string, string> {
	const key = apiKey.trim();
	if (key === "") {
		throw new LlmError("未配置 API Key。请到「设置 → Knowledge Nav」里填写。");
	}
	return {
		"Content-Type": "application/json",
		Authorization: `Bearer ${key}`,
	};
}

async function postChat(cfg: LlmConfig, body: unknown): Promise<ChatResponse> {
	const res = await requestUrl({
		url: endpoint(cfg.apiBaseUrl),
		method: "POST",
		headers: authHeaders(cfg.apiKey),
		body: JSON.stringify(body),
		throw: false,
	});

	if (res.status < 200 || res.status >= 300) {
		let detail = "";
		try {
			detail = (res.json as ChatResponse)?.error?.message ?? "";
		} catch {
			detail = String(res.text ?? "").slice(0, 300);
		}
		throw new LlmError(
			`API 返回 ${res.status}${detail ? `：${detail}` : ""}`,
			res.status
		);
	}

	let data: ChatResponse;
	try {
		data = res.json as ChatResponse;
	} catch {
		throw new LlmError("API 返回的不是合法 JSON。");
	}

	if (data?.error?.message) {
		throw new LlmError(`API 报错：${data.error.message}`);
	}
	return data;
}

/** Send a prompt and return the assistant's text. */
export async function generateNavigation(
	cfg: LlmConfig,
	systemPrompt: string,
	userPrompt: string
): Promise<string> {
	const data = await postChat(cfg, {
		model: cfg.model,
		messages: [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: userPrompt },
		],
		temperature: 0.2,
		stream: false,
	});

	const content = data?.choices?.[0]?.message?.content;
	if (!content || content.trim() === "") {
		throw new LlmError("API 返回了空内容。");
	}
	return content;
}

/** Cheap round-trip used by the "test connection" button in settings. */
export async function testConnection(cfg: LlmConfig): Promise<string> {
	const data = await postChat(cfg, {
		model: cfg.model,
		messages: [{ role: "user", content: "回复两个字：正常" }],
		temperature: 0,
		stream: false,
	});
	const content = data?.choices?.[0]?.message?.content ?? "";
	return content.trim() || "(空回复)";
}
