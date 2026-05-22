# claude-session-notes

A standalone Claude Code plugin that captures structured summaries of Claude sessions and publishes them as shareable pages at `notes.{your-domain}/{uuid}`.

## What it does

- Run `/notes` in any Claude Code session
- Claude synthesizes the conversation into a structured note: Summary, Key Topics, Decisions & Insights, Action Items, Code Snippets
- Generates a self-contained HTML file (no CDN deps) with a markdown/HTML toggle and copy button
- Optionally deploys to GitHub Pages at `notes.{your-domain}/{uuid}`
- Notes index at `notes.{your-domain}` lists all published notes

## Install

### 1. Copy the command file

```bash
mkdir -p ~/.claude/commands
cp commands/notes.md ~/.claude/commands/notes.md
```

### 2. Copy the plugin scripts and assets

```bash
INSTALL_DIR=~/.claude/plugins/session-notes
mkdir -p "$INSTALL_DIR"
cp -r scripts assets skills "$INSTALL_DIR/"
```

### 3. First run

Open a new Claude Code session and run `/notes`. The first run walks you through:

1. Your domain (e.g. `thethoughtdungeon.com` → notes publish at `notes.thethoughtdungeon.com/{uuid}`)
2. Your GitHub username and notes repo name
3. Optionally creates the GitHub repo for you (`gh repo create ...`)
4. Shows DNS setup instructions

### 4. DNS setup (one time)

Add a CNAME record at your DNS provider:

| Type | Name | Value |
|------|------|-------|
| CNAME | `notes` | `{github-username}.github.io` |

Then in your notes repo settings → Pages → set custom domain to `notes.{your-domain}` and enable Enforce HTTPS.

## Usage

```
/notes                        # Capture and optionally publish current session
/notes My Custom Title        # Use a specific title
/notes --deploy <uuid>        # Deploy a previously generated note
```

Notes are saved locally to `~/.claude/notes-publisher/notes/` before any deployment.

## How it works

```
/notes
  → reads ~/.claude/notes-publisher/config.json
  → Claude synthesizes session → /tmp/session-notes-summary.md
  → scripts/generate-note.mjs → {uuid}.md + {uuid}.html
  → (optional) scripts/deploy-note.mjs → gh api uploads to GitHub Pages
                                        → updates manifest.json + index.html
```

### Generated note structure

```markdown
## Summary
## Key Topics
## Decisions & Insights
## Action Items
## Code Snippets
```

### HTML features

- Self-contained (no external dependencies, works offline)
- Toggle between rendered HTML and raw markdown
- Copy markdown to clipboard button
- Responsive, dark/light mode via `prefers-color-scheme`
- Warm clay accent color (`#D97757`)

## Config

Stored at `~/.claude/notes-publisher/config.json` after first run:

```json
{
  "domain": "notes.thethoughtdungeon.com",
  "github_user": "chastep",
  "github_repo": "notes",
  "github_branch": "main",
  "output_dir": "/Users/you/.claude/notes-publisher/notes"
}
```

## Requirements

- [Claude Code](https://claude.ai/code)
- [GitHub CLI](https://cli.github.com/) (`gh auth login`)
- Node.js 18+ (no npm install needed — scripts use built-ins only)

## File structure

```
claude-session-notes/
├── commands/
│   └── notes.md              # Slash command definition (/notes)
├── skills/
│   └── session-notes/
│       ├── SKILL.md           # Context-triggered skill variant
│       └── references/
│           └── dns-setup.md   # DNS instructions shown on first run
├── scripts/
│   ├── generate-note.mjs     # UUID + markdown + HTML generation
│   └── deploy-note.mjs       # GitHub Pages deployment via gh api
├── assets/
│   ├── note-template.html    # Self-contained note page template
│   └── index-template.html   # Notes listing page template
└── .claude-plugin/
    └── plugin.json           # Plugin metadata
```

## License

MIT
