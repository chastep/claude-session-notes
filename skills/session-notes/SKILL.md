---
name: session-notes
description: Use this skill when the user invokes "/notes", "/session-notes", asks to "save session notes", "publish notes", "capture this session", "summarize this conversation", or "share these notes". Generates a structured summary of the current Claude session, writes markdown and self-contained HTML files locally, and optionally deploys them to GitHub Pages at notes.{domain}/{uuid}.
version: 1.0.0
argument-hint: [title] [--deploy <uuid>]
allowed-tools: Read, Write, Bash, Edit
---

# Session Notes Publisher

Capture and optionally publish a structured summary of the current Claude session.

---

## Step 1: Load or Initialize Config

Read the config file using the Read tool:
- Path: `~/.claude/notes-publisher/config.json`

If the file does not exist or cannot be read, go to **Step 1a: First-Time Setup**.

Expected config shape:
```json
{
  "domain": "notes.thethoughtdungeon.com",
  "github_user": "chastep",
  "github_repo": "notes-thethoughtdungeon",
  "github_branch": "main",
  "output_dir": "/Users/chasestephens/.claude/notes-publisher/notes"
}
```

---

### Step 1a: First-Time Setup

Tell the user:
> "Welcome to Session Notes! Let's get you set up. I'll ask a few questions."

Ask these questions **one at a time**, waiting for each answer:

1. "What domain do you own? (e.g., `thethoughtdungeon.com`) — Notes will be published at `notes.{domain}/{uuid}`."
2. "What is your GitHub username?"
3. "What should the GitHub repository be named for your notes? (Suggested: `notes-{domain-without-tld}`, e.g., `notes-thethoughtdungeon`)"
4. "Which branch should GitHub Pages serve from? (Press Enter for `main`)"

After collecting answers:
- Expand `~` in paths using the user's actual home directory
- Write config to `~/.claude/notes-publisher/config.json` (create directory with `mkdir -p` first)
- Create the notes output directory: `mkdir -p ~/.claude/notes-publisher/notes`
- Read `${CLAUDE_PLUGIN_ROOT}/skills/session-notes/references/dns-setup.md` and display it verbatim to the user, substituting `{domain}`, `{github_user}`, and `{github_repo}` placeholders with actual values
- Ask: "Should I create the GitHub repo `{github_user}/{github_repo}` now?"
  - If yes: run `gh repo create {github_user}/{github_repo} --public --description "Session notes published by Claude Code"`
  - If no: remind them to create it before deploying
- Tell the user to complete DNS setup, then continue

---

## Step 2: Check for --deploy flag

If the user invoked `/notes --deploy {uuid}`:
- Skip to **Step 5: Deploy** using the provided UUID
- Load the existing files from `{output_dir}/{uuid}.md` and `{output_dir}/{uuid}.html`

---

## Step 3: Synthesize the Session

Analyze the full conversation and produce a structured summary. If the user provided a title via `/notes My Custom Title`, use that; otherwise generate a concise one (8 words max).

Produce these sections (omit Action Items if none exist):

```markdown
---
title: "{Title}"
uuid: "{uuid-will-be-filled-by-script}"
date: "{YYYY-MM-DD}"
published_at: "{ISO timestamp}"
tags: [comma, separated, auto-generated, tags]
description: "One sentence summary for index listing"
---

# {Title}

## Summary

2–4 sentence narrative of what was accomplished or discussed in this session.

## Key Topics

- Topic or technology 1
- Topic or technology 2
- ...

## Decisions & Insights

- Notable conclusion or architectural decision
- Key discovery or recommendation
- ...

## Action Items

- [ ] Explicit next step or follow-up task
- [ ] ...

## Code Snippets

### {Label for snippet 1}
```language
code here
```

### {Label for snippet 2}
```language
code here
```
```

Write this markdown to `/tmp/session-notes-summary.md` using the Write tool.

---

## Step 4: Generate Files

Run the generation script. First, determine the PLUGIN_ROOT:

```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/marketplaces/claude-plugins-official/plugins/session-notes 2>/dev/null || ls -d ~/.claude/plugins/*/plugins/session-notes 2>/dev/null | head -1)
echo $PLUGIN_ROOT
```

Then run:
```bash
node "$PLUGIN_ROOT/scripts/generate-note.mjs" \
  --summary-file /tmp/session-notes-summary.md \
  --config ~/.claude/notes-publisher/config.json \
  --plugin-root "$PLUGIN_ROOT"
```

Capture the JSON output. It will look like:
```json
{
  "uuid": "2026-05-21-a3f7b2c1",
  "md_path": "/Users/.../.claude/notes-publisher/notes/2026-05-21-a3f7b2c1.md",
  "html_path": "/Users/.../.claude/notes-publisher/notes/2026-05-21-a3f7b2c1.html",
  "public_url": "https://notes.thethoughtdungeon.com/2026-05-21-a3f7b2c1"
}
```

Show the user:
- UUID assigned
- Local file paths (md and html)
- What the public URL will be once deployed

---

## Step 5: Offer Deployment

Ask: "Deploy to GitHub Pages at `{public_url}`? (y/n)"

**If yes**, run:
```bash
node "$PLUGIN_ROOT/scripts/deploy-note.mjs" \
  --uuid "{uuid}" \
  --config ~/.claude/notes-publisher/config.json \
  --plugin-root "$PLUGIN_ROOT"
```

On success, tell the user:
> "Published! View your note at: {public_url}
> Notes index: https://{domain}"

Note: GitHub Pages may take 1–2 minutes to reflect new content.

**If no**, tell the user:
> "Saved locally:
> - Markdown: {md_path}
> - HTML: {html_path}
>
> To publish later, run: `/notes --deploy {uuid}`"

---

## Notes

- Always generate files locally before offering deployment
- The HTML file is fully self-contained — no external dependencies, works offline
- The markdown file is the canonical source; HTML embeds it as both raw text and pre-rendered HTML
- Scripts use only Node.js built-ins — no `npm install` needed
- If `gh` CLI is not authenticated, the deploy step will fail with a helpful error from `gh`
