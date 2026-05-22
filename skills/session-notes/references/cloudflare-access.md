# Securing Your Notes Site with Cloudflare Access

By default, notes published to `notes.{domain}` are publicly accessible to anyone with the URL. Cloudflare Access lets you gate the entire site behind an email login — only addresses you explicitly allow can get in.

This is an optional step. The publish pipeline is unaffected regardless of whether Access is enabled.

---

## Prerequisites

- A domain managed by (or moved to) Cloudflare DNS
- A free Cloudflare account
- GitHub Pages already serving your notes site (see `dns-setup.md`)

---

## Step 1: Add your domain to Cloudflare

1. Sign up at [cloudflare.com](https://cloudflare.com) (free plan)
2. **Add a site** → enter your root domain (e.g. `thethoughtdungeon.com`) → select **Free**
3. Cloudflare scans your existing DNS records. Verify the following are present — add any that are missing:

   | Type  | Name    | Content                   | Proxy status |
   |-------|---------|---------------------------|--------------|
   | CNAME | `notes` | `{github_user}.github.io` | **Proxied** (orange cloud) |

   The proxy must be **on** (orange cloud) for Access to intercept requests. DNS-only (grey cloud) bypasses it.

4. Cloudflare gives you two nameserver addresses (e.g. `aria.ns.cloudflare.com`). Keep the tab open.

---

## Step 2: Change nameservers at your DNS provider

Log into your registrar (GoDaddy, Namecheap, etc.) and replace the existing nameservers with the two Cloudflare provided. The setting is usually under **DNS → Nameservers → Custom**.

Propagation typically takes 10–30 minutes. Cloudflare polls and notifies you when the domain is active.

---

## Step 3: Fix SSL to prevent redirect loops

Once the domain is active in Cloudflare:

1. **SSL/TLS → Overview** → set encryption mode to **Full**
   - "Flexible" causes redirect loops with GitHub Pages
   - "Full (Strict)" fails because GitHub Pages uses a shared certificate
2. **SSL/TLS → Edge Certificates** → toggle **Always Use HTTPS** to On

---

## Step 4: Set up Cloudflare Access

1. In the Cloudflare dashboard, click **Zero Trust** in the left nav
2. On first visit, choose a team name (e.g. `yourname-personal`) — this becomes `{team}.cloudflareaccess.com`
3. **Access → Applications → Add an application → Self-hosted**
4. Fill in:
   - **Application name**: `Session Notes`
   - **Subdomain**: `notes`
   - **Domain**: your root domain
   - **Path**: leave blank (protects the whole site)
5. Click **Next → Add a policy**:
   - **Policy name**: `owners`
   - **Action**: Allow
   - **Include rule**: Selector = **Emails**, Value = your email address
6. Click **Next** → leave login methods as default (One-time PIN is enabled automatically)
7. **Save application**

---

## How login works

Anyone visiting `notes.{domain}` is redirected to a Cloudflare login page. They enter an email address — if it's not on your allow list, they're denied immediately. If it matches, Cloudflare emails a 6-digit PIN (expires in 10 minutes). After entering the code, they get a session cookie valid for 24 hours.

Check your spam folder if the PIN email doesn't arrive — Cloudflare's transactional emails are occasionally filtered by Gmail.

---

## Optional: Add Google OAuth (skip the PIN email)

If you'd prefer a one-click "Sign in with Google" button instead of waiting for a PIN:

1. Create an OAuth 2.0 client in [Google Cloud Console](https://console.cloud.google.com):
   - APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
   - Application type: **Web application**
   - Authorized redirect URI: `https://{team}.cloudflareaccess.com/cdn-cgi/access/callback`
2. In Cloudflare Zero Trust → **Settings → Authentication → Add new → Google**
   - Paste the Client ID and Client Secret
3. The Access login page will now show a "Sign in with Google" button alongside the PIN option

---

## Resetting your session (for testing)

To force the login gate to appear again in a browser that already has a session cookie:

**Option A** — navigate to:
```
https://notes.{domain}/cdn-cgi/access/logout
```

**Option B** — open Chrome DevTools → Application tab → Cookies → delete entries for `notes.{domain}` and `cloudflareaccess.com`, then refresh.

**Option C** — use an incognito/private window, which never has a session cookie.

---

## Troubleshooting

**Site loads without hitting the Access gate** — the `notes` CNAME record is probably set to DNS-only (grey cloud). Change it to Proxied (orange cloud) in Cloudflare DNS.

**"Not Secure" in browser** — SSL mode is set to Off or Flexible. Set it to Full and enable Always Use HTTPS (Step 3).

**PIN email never arrives** — check spam. If unreliable, add Google OAuth as an alternative login method.

**Access is blocking the publish pipeline** — it won't. `deploy-note.mjs` pushes directly to the GitHub repo via the GitHub API, which never touches your Cloudflare-proxied domain.
