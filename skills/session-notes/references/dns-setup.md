# DNS Setup for Session Notes

To publish notes at `notes.{domain}`, you need to:
1. Point the `notes` subdomain to GitHub Pages (DNS)
2. Tell GitHub Pages to serve your notes repo at that subdomain (GitHub)

---

## Step 1: Add a DNS CNAME Record

Log into your DNS provider (Cloudflare, Namecheap, Route 53, Google Domains, etc.) and add:

| Type  | Name  | Value                   | TTL  |
|-------|-------|-------------------------|------|
| CNAME | notes | {github_user}.github.io | Auto |

**Example** for domain `thethoughtdungeon.com`, GitHub user `chastep`:
- Name: `notes`
- Value: `chastep.github.io`

---

## Step 2: Configure GitHub Pages on Your Notes Repo

Once the repo `{github_user}/{github_repo}` exists, go to:

```
https://github.com/{github_user}/{github_repo}/settings/pages
```

Set the following:
- **Source**: Deploy from branch → `main` → `/ (root)`
- **Custom domain**: `notes.{domain}`
- **Enforce HTTPS**: check this box (available after DNS propagates)

The deploy script will automatically add the required `CNAME` file to your repo on first publish.

---

## Step 3: Wait for DNS Propagation

DNS changes typically take **5–30 minutes**, occasionally up to 48 hours.

Check propagation status: https://www.whatsmydns.net/#CNAME/notes.{domain}

---

## Troubleshooting

**"HTTPS not yet available"** — DNS hasn't fully propagated yet. Wait 15–30 minutes after the CNAME record appears in propagation checker.

**404 on your note URL** — Check that:
1. The `CNAME` file in your repo root contains exactly `notes.{domain}` (no trailing slash or newline issues)
2. GitHub Pages is enabled on the `main` branch
3. The note HTML file was successfully uploaded

**Note not updating** — GitHub Pages caches aggressively. Try a hard refresh (`Cmd+Shift+R`) or wait 2–3 minutes after deploy.

**`gh: command not found`** — Install GitHub CLI: https://cli.github.com/ then run `gh auth login`
