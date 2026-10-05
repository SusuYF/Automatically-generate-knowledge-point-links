/**
 * Shared types for the Knowledge Nav plugin.
 */

/** A single navigation entry: `[[#anchor|text]]`. */
export interface NavLink {
	anchor: string;
	text: string;
}

/** One line of the validation report. */
export interface CheckResult {
	name: string;
	detail: string;
	ok: boolean;
}

/** Result of validating a generated navigation block. */
export interface ValidationReport {
	links: NavLink[];
	checks: CheckResult[];
	problems: string[];
	ok: boolean;
}

/** A heading the model wants inserted into the note body. */
export interface HeadingInsert {
	/** 1-based line number in the ORIGINAL note, before which to insert. */
	line: number;
	/** Full heading text, e.g. `## RAG：运行时动态扩充上下文`. */
	title: string;
}

/** What the model returns for one note. */
export interface GenerationResult {
	/** The callout block, ready to paste at the top of the note. */
	nav: string;
	/** Headings to insert into the body (empty when none are needed). */
	inserts: HeadingInsert[];
}

/** Parsed structure of a note, used to decide whether to split headings. */
export interface NoteStructure {
	totalLines: number;
	headings: { level: number; text: string; line: number }[];
	headingCounts: Record<number, number>;
	/** Non-heading, non-table, non-empty lines. */
	bodyLines: number;
	/** Visual width of the body text (CJK=2, ASCII=1). Language-neutral. */
	bodyWidth: number;
	/** CJK character count — informational only. */
	cjkChars: number;
	/** Whether the note already carries a generated nav block. */
	hasNavBlock: boolean;
}

export interface KnowledgeNavSettings {
	/** OpenAI-compatible endpoint, e.g. https://api.deepseek.com/v1 */
	apiBaseUrl: string;
	apiKey: string;
	model: string;
	/** Hard cap on navigation entries. */
	maxItems: number;
	/** Max visual width per entry (CJK=2, ASCII=1). */
	maxWidth: number;
	/** Allow inserting headings into the note body. */
	allowHeadingInsert: boolean;
	/** Back up the note before writing. */
	autoBackup: boolean;
	/** Vault-relative folder for backups. */
	backupFolder: string;
	/** Extra instructions appended to the prompt. */
	extraInstructions: string;
}

export const DEFAULT_SETTINGS: KnowledgeNavSettings = {
	apiBaseUrl: "https://api.deepseek.com/v1",
	apiKey: "",
	model: "deepseek-chat",
	maxItems: 40,
	maxWidth: 70,
	allowHeadingInsert: true,
	autoBackup: true,
	backupFolder: "_backup",
	extraInstructions: "",
};

/** Thresholds mirrored from the protocol document. */
export const LIMITS = {
	/** Below this visual width an entry is treated as a bare label. */
	minWidth: 16,
	/** If display text contains the anchor and exceeds this ratio → "echoes the heading". */
	echoRatio: 0.6,
	/**
	 * Body visual width below which the note is never split.
	 * Visual width, not character count: a CJK note of 500 characters and an
	 * English note of 1000 characters are about equally long.
	 */
	minCharsToSplit: 1000,
	/** Body visual width above which a sparsely-sectioned note gets split. */
	minCharsForSplit: 1600,
	/** A note with fewer than this many subheadings is a candidate for splitting. */
	sparseSubheadingCount: 3,
	/**
	 * Entry width limit for CJK-dominant notes — 70 ≈ 35 Chinese characters.
	 * At this width the hover preview shows 2–3 lines without clipping.
	 */
	cjkMaxWidth: 70,
	/**
	 * Entry width limit for Latin-dominant notes — 120 ≈ 20 English words.
	 *
	 * Visual width is not information. 70 units buys 35 Chinese characters
	 * (≈35 morphemes) but only ~14 English words. Measured on a real note:
	 * 7 of 18 English entries were rejected at a 70 limit while carrying the
	 * same meaning as CJK entries that passed at that same limit.
	 */
	latinMaxWidth: 120,
	/** Above this CJK share of non-space characters, treat the note as CJK-dominant. */
	cjkDominantRatio: 0.3,
	/**
	 * Body visual width below which no navigation is generated at all.
	 * A note this short is read in one glance; a nav block would only add
	 * noise, and with no subheadings the model has nothing valid to anchor to.
	 */
	minBodyWidthForNav: 300,
} as const;
