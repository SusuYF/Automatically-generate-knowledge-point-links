# 🧭 Knowledge Nav

**A table of contents tells you where things are. This tells you what's there.**

Knowledge Nav reads a note and generates a navigation block where every link's display
text is a *distilled statement* — not a heading copied verbatim. Each one points at the
section it came from. Hover to preview that section without losing your place.

It lives in a collapsed callout at the top of the note, so it costs zero screen space
until you want it.

## 👀 What it looks like

Feed it a note like this:

```markdown
# Spaced repetition

## Why memory fails

People systematically overestimate how well they remember things. The forgetting
curve is not linear — it drops steeply in the first few hours. Retrieval practice
beats re-reading by roughly a factor of two. Confidence correlates only weakly
with actual accuracy.
```

and you get this at the top:

```markdown
> [!abstract] 导航
> **一、Why memory fails**
> - [[#Why memory fails|Forgetting is steepest in the first few hours, not linear]]
> - [[#Why memory fails|Retrieval practice beats re-reading by roughly 2x]]
> - [[#Why memory fails|Confidence correlates only weakly with accuracy]]
```

Three links, three things you can actually remember. A normal TOC would have handed you
`Why memory fails` and called it a day.

## 🤔 Why not just a TOC

| | Ordinary TOC plugin | 🧭 Knowledge Nav |
|---|---|---|
| What it lists | Your headings, verbatim | Distilled knowledge points |
| Note has no headings | Produces one sad line | Splits the body into sections |
| Reads the note's meaning | No | Yes |

**If your notes are already well-sectioned and you just want a clickable outline,
an ordinary TOC plugin is the better tool and you should use one.** This is for the
other case: the 3000-word note you wrote as a wall of text and now can't navigate.

## 📦 Install

Not in the community directory yet. Manual install:

1. Grab `main.js`, `manifest.json` and `styles.css` from the
   [latest release](https://github.com/SusuYF/Automatically-generate-knowledge-point-links/releases/latest).
2. Drop them into `<your-vault>/.obsidian/plugins/knowledge-nav/`.
3. Reload Obsidian, then enable **Knowledge Nav** in Settings → Community plugins.

## ⚙️ Setup

Open **Settings → Knowledge Nav**. Three fields, then you're done:

| Field | What to put |
|---|---|
| **API base URL** | Any OpenAI-compatible endpoint — `https://api.deepseek.com/v1`, `https://api.moonshot.cn/v1`, `http://localhost:11434/v1` (Ollama)… |
| **API key** | From your provider |
| **Model** | `deepseek-chat`, `kimi-k2-0905-preview`, `qwen2.5:14b`… |

Hit **Test** to confirm all three line up before you waste a note on them.

Then open a note and run **Knowledge Nav: Generate navigation for current note** from
the command palette. You'll get a preview — nothing touches your vault until you say so.

## 🔒 Network use

**This plugin sends your note text to an LLM endpoint that you configure.** In full:

- **Which service.** Whatever you type into the API base URL. The plugin ships with no
  default endpoint and phones home to nobody.
- **What gets sent.** The text of the note you ran it on, plus the prompt. That's it.
- **What doesn't.** No other notes. No vault metadata. No file names. No usage data.
- **No telemetry.** Nothing is collected, reported, or phoned anywhere.
- **Your API key** lives in the plugin's `data.json` inside your vault, in plain text —
  the same convention every other Obsidian plugin uses. It goes out only as an
  `Authorization` header to the endpoint above.
- **Nothing is written until you press Apply.** You see the result and the validation
  report first.

Point the base URL at a local Ollama instance and nothing leaves your machine at all.

## ⚠️ Known limitations

Stated plainly, because they decide whether this tool is right for you:

- **🔗 Links jump to the section, not the exact line.** Five knowledge points under one
  heading all land in the same place. This is deliberate: pinning to exact lines needs
  block IDs on individual lines, which turns your clean note source into noise. This
  design is built for *scanning* (hover preview), not precision jumping. **Requires the
  core Page preview plugin to be enabled** — without it you get links you can't peek at.
- **🧠 Output quality is the model's, not ours.** A small local model produces
  noticeably worse nav blocks than a frontier model. The validation report catches
  structural breakage; it cannot tell you whether a knowledge point is *good*.
- **💸 One API call per note**, billed by your provider. No batching, no caching.
- **✂️ Heading insertion touches your note body.** When a long note has almost no
  subheadings, the plugin may insert `##` headings so the nav has something to point at.
  Only heading lines are inserted — your prose is never touched, and the plugin verifies
  this after writing. Don't like it? Turn it off in settings.
- **📝 Markdown notes only.** No Canvas, no PDF, no databases.

## 🛠 Development

```bash
npm install
npm run dev     # watch mode, rebuilds main.js on change
npm run build   # type-check + production bundle
npm test        # 29 unit tests, no network needed
```

To try it against a real vault, symlink or copy the repo into
`<vault>/.obsidian/plugins/knowledge-nav/` and enable it.

The validation rules live in `src/core.ts`. They are **computed, never asked of the
model** — in testing the model's own item count was wrong twice (claimed 40 when there
were 43; flagged six perfectly good entries as over-width). Counting is a solved problem;
don't outsource it to a language model.

## 📄 License

MIT — see [LICENSE](./LICENSE). Go build something with it.
