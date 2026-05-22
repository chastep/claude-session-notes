---
description: Capture and publish structured notes from the current Claude session to GitHub Pages at notes.{domain}/{uuid}. Generates markdown + self-contained HTML locally, then optionally deploys.
argument-hint: [title] [--deploy <uuid>] [--remove <uuid>] [--edit <uuid>]
allowed-tools: Read, Write, Bash, Edit
---

# Session Notes Publisher

Capture and optionally publish a structured summary of the current Claude session.

---

## Step 1: Load or Initialize Config

Read the config file:
- Path: `~/.claude/notes-publisher/config.json`

If the file does not exist, run **First-Time Setup**:

1. Ask: "What domain do you own? (e.g., `thethoughtdungeon.com`) — Notes will publish at `notes.{domain}/{uuid}`."
2. Ask: "What is your GitHub username?"
3. Ask: "What should the GitHub repo be named? (suggested: `notes-{domain-without-tld}`)"
4. Ask: "Which branch for GitHub Pages? (default: `main`)"

After collecting answers, write config to `~/.claude/notes-publisher/config.json`:
```json
{
  "domain": "notes.{domain}",
  "github_user": "{github_user}",
  "github_repo": "{github_repo}",
  "github_branch": "main",
  "output_dir": "{expanded-home}/.claude/notes-publisher/notes"
}
```
Then run `mkdir -p ~/.claude/notes-publisher/notes`.

Show the DNS setup instructions (read and display `${CLAUDE_PLUGIN_ROOT}/skills/session-notes/references/dns-setup.md`).

Ask: "Should I create the GitHub repo `{github_user}/{github_repo}` now?" — if yes, run `gh repo create {github_user}/{github_repo} --public`.

---

## Step 2: Handle flags

**`/notes --deploy {uuid}`** — Skip to **Step 5** using the provided UUID.

**`/notes --remove {uuid}`** — Remove a published note:
```bash
node "$PLUGIN_ROOT/scripts/deploy-note.mjs" \
  --remove "{uuid}" \
  --config ~/.claude/notes-publisher/config.json \
  --plugin-root "$PLUGIN_ROOT"
```
Report: "Removed `{uuid}` from GitHub Pages and manifest." Then stop — do not synthesize or deploy.

**`/notes --edit {uuid}`** — Re-synthesize and re-deploy an existing note under the same UUID:
1. Read `{output_dir}/{uuid}.md` to show the user the current title and description.
2. Inform the user: "I'll re-synthesize this session and redeploy under the same UUID."
3. Proceed to **Step 3** (synthesize), then **Step 4** (generate with `--uuid {uuid}` flag), then **Step 5** (deploy directly without asking — the user already confirmed by invoking `--edit`).

---

## Step 3: Synthesize the Session

Analyze the full conversation. If the user provided a title (e.g., `/notes My Title`), use it; otherwise generate a concise one (8 words max).

Write the following to `/tmp/session-notes-summary.md`:

```markdown
---
title: "{Title}"
uuid: "{uuid-will-be-filled-by-script}"
date: "{YYYY-MM-DD}"
published_at: "{ISO timestamp}"
tags: [auto-generated, tags]
description: "One sentence summary"
---

# {Title}

## Summary
2–4 sentence narrative of what was accomplished.

## Key Topics
- Topic 1
- Topic 2

## Decisions & Insights
- Key decision or insight

## Action Items
- [ ] Next step (omit section if none)

## Code Snippets
### {Label}
```language
code here
```
```

---

## Step 4: Generate Files

Find the plugin root:
```bash
PLUGIN_ROOT=$(ls -d ~/.claude/plugins/cache/claude-plugins-official/session-notes/1.0.0 2>/dev/null || ls -d ~/.claude/plugins/marketplaces/claude-plugins-official/plugins/session-notes 2>/dev/null | head -1)
echo $PLUGIN_ROOT
```

Then generate (add `--uuid {uuid}` when in edit mode to preserve the existing UUID):
```bash
node "$PLUGIN_ROOT/scripts/generate-note.mjs" \
  --summary-file /tmp/session-notes-summary.md \
  --config ~/.claude/notes-publisher/config.json \
  --plugin-root "$PLUGIN_ROOT" \
  [--uuid "{existing-uuid}"]
```

Capture the JSON output `{ uuid, md_path, html_path, public_url }` and show the user:
- UUID, local file paths, pending public URL

---

## Step 5: Offer Deployment

Ask: "Deploy to GitHub Pages at `{public_url}`? (y/n)"

If yes:
```bash
node "$PLUGIN_ROOT/scripts/deploy-note.mjs" \
  --uuid "{uuid}" \
  --config ~/.claude/notes-publisher/config.json \
  --plugin-root "$PLUGIN_ROOT"
```

Report: "Published! View at: {public_url} · Index: https://{domain}"

If no: "Saved locally — run `/notes --deploy {uuid}` to publish later."
