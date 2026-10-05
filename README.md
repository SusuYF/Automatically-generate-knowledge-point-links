# Knowledge Nav

Generate a knowledge-point-level navigation block at the top of an Obsidian note.

A table of contents copies your headings. This does something different: it reads the
note and produces an index of the **knowledge points** inside it. Each link's display
text is a distilled statement, and the anchor points at the section it came from.
Hover a link to preview that section without losing your place.

## What it looks like

Given a note like this:

```markdown
# Spaced repetition

## Why memory fails

People systematically overestimate how well they remember things. The forgetting
curve is not linear — it drops steeply in the first few hours. Retrieval practice
beats re-reading by roughly a factor of two. Confidence correlates only weakly
with actual accuracy.
```

the plugin writes this at the top:

```markdown
> [!abstract] 导航
> **一、Why memory fails**
> - [[#Why memory fails|Forgetting is steepest in the first few hours, not linear]]
> - [[#Why memory fails|Retrieval practice beats re-reading by roughly 2x]]
> - [[#Why memory fails|Confidence correlates only weakly with accuracy]]
```

The nav block is a callout, so it is collapsed by default and costs no screen space.

## Why not just a TOC

| | Ordinary TOC plugin | Knowledge Nav |
|---|---|---|
| What it lists | Your headings, verbatim | Distilled knowledge points |
| Works on a note with no headings | No — produces one line | Yes — splits the body into sections |
| Reads the note's meaning | No | Yes |

If your notes are already well-sectioned and you just want a clickable outline,
an ordinary TOC plugin is the better tool and you should use one.

## Install

Not yet in the community directory. To install manually:

1. Download `main.js`, `manifest.json` and `styles.css` from the latest release.
2. Put them in `<your-vault>/.obsidian/plugins/knowledge-nav/`.
3. Reload Obsidian and enable **Knowledge Nav** in Settings → Community plugins.

## Setup

Open **Settings → Knowledge Nav** and fill in three fields:

- **API base URL** — any OpenAI-compatible endpoint. Examples:
  `https://api.deepseek.com/v1`, `https://api.moonshot.cn/v1`,
  `http://localhost:11434/v1` (Ollama).
- **API key** — from your provider.
- **Model** — e.g. `deepseek-chat`, `kimi-k2-0905-preview`, `qwen2.5:14b`.

Press **Test** to confirm all three line up before using it on a note.

Then open a note and run **Knowledge Nav: Generate navigation for current note**
from the command palette.

## Network use

**This plugin sends your note text to an LLM endpoint that you configure.**

- **Which service.** Whatever you enter as the API base URL. The plugin ships with no
  default endpoint and contacts nothing on its own.
- **What is sent.** The full text of the note you run the command on, plus the prompt.
  Nothing else.
- **What is not sent.** No other notes, no vault metadata, no file names, no usage data.
- **No telemetry of any kind.** Nothing is collected or reported anywhere.
- **API key storage.** Stored in the plugin's `data.json` inside your vault, in plain
  text — the same convention other Obsidian plugins use. It is sent only as an
  `Authorization` header to the endpoint above.
- **Nothing is written to your vault until you press Apply.** Generated results are
  shown in a preview first, with the validation report attached.

If you point the base URL at a local Ollama instance, no data leaves your machine.

## Known limitations

Stated plainly, because they affect whether this is the right tool for you:

- **Links jump to the section, not the exact line.** Several knowledge points under
  one heading all lead to the same place. This is a deliberate trade-off: precision
  would require inserting block IDs on individual lines, which makes the note source
  much noisier. Navigation here is designed for *scanning* (with Page preview hover),
  not for precise jumping. Requires the core **Page preview** plugin to be enabled.
- **Output quality depends on the model.** Small local models produce noticeably worse
  nav blocks than frontier models. The validation report tells you when a result is
  structurally broken, but it cannot tell you whether the knowledge points are *good*.
- **It costs money per note** if you use a paid API. One call per note, no batching.
- **Heading insertion modifies your note body.** When a long note has almost no
  subheadings, the plugin may insert `##` headings so the nav has something to point
  at. Only heading lines are inserted — the note's own text is never touched, and the
  plugin verifies this after writing. You can disable it in settings.
- **Only Markdown notes.** No Canvas, no PDF.

## Development

```bash
npm install
npm run dev     # watch mode, rebuilds main.js on change
npm run build   # type-check + production bundle
```

To test against a real vault, symlink or copy the repo into
`<vault>/.obsidian/plugins/knowledge-nav/` and enable it.

The validation rules live in `src/core.ts`. They are deliberately computed rather than
asked of the model — in testing, the model's own counts were wrong twice (reported 40
items when there were 43; flagged six valid entries as over-width).

## License

MIT — see [LICENSE](./LICENSE).
