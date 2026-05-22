#!/usr/bin/env node
/**
 * deploy-note.mjs
 * Uploads a note (md + html) to a GitHub Pages repo via the GitHub Contents API
 * using the `gh` CLI. Updates manifest.json and regenerates index.html.
 *
 * Usage:
 *   node deploy-note.mjs \
 *     --uuid 2026-05-21-a3f7b2c1 \
 *     --config ~/.claude/notes-publisher/config.json \
 *     --plugin-root /path/to/session-notes
 *
 * Outputs: the public URL on success, exits 1 on failure.
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { homedir } from 'os';

// ── Helpers ───────────────────────────────────────────────────────────────────

function expandPath(p) {
  return p.replace(/^~/, homedir());
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

function gh(args, bodyFile) {
  const inputFlag = bodyFile ? `--input ${bodyFile}` : '';
  return execSync(`gh api ${args} ${inputFlag}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function ghSilent(args, bodyFile) {
  try {
    return gh(args, bodyFile);
  } catch {
    return null;
  }
}

// Get SHA of an existing file in the repo (null if it doesn't exist)
function getFileSha(user, repo, branch, path) {
  try {
    const result = gh(`repos/${user}/${repo}/contents/${path}?ref=${branch}`);
    return JSON.parse(result).sha || null;
  } catch {
    return null;
  }
}

// Upload a file via GitHub Contents API
function uploadFile(user, repo, branch, remotePath, localContent, message, sha) {
  const b64 = Buffer.from(localContent).toString('base64');
  const body = { message, content: b64, branch };
  if (sha) body.sha = sha;

  const bodyFile = `/tmp/gh-upload-${Date.now()}.json`;
  writeFileSync(bodyFile, JSON.stringify(body), 'utf8');
  try {
    gh(`repos/${user}/${repo}/contents/${encodeURIComponent(remotePath)} --method PUT`, bodyFile);
  } finally {
    try { unlinkSync(bodyFile); } catch {}
  }
}

// ── Index generator ───────────────────────────────────────────────────────────

function buildIndexHtml(template, manifest, domain, rootDomain, updatedAt) {
  const count = manifest.length;

  let listItems = '';
  if (count === 0) {
    listItems = '';
  } else {
    listItems = manifest.map(entry => {
      const url = entry.url || `https://${domain}/${entry.uuid}`;
      const desc = entry.description
        ? `<div class="note-item-desc">${escapeHtml(entry.description)}</div>`
        : '';
      return `<li class="note-item">
  <a href="${url}">
    <div class="note-item-title">${escapeHtml(entry.title)}</div>
    <div class="note-item-meta">
      <span class="date">${escapeHtml(entry.date)}</span>
      <span class="uuid">${escapeHtml(entry.uuid)}</span>
    </div>
    ${desc}
  </a>
</li>`;
    }).join('\n');
  }

  const ifEmptyBlock = count === 0
    ? '<div class="empty-state"><p>No notes published yet.</p><p>Run <code>/notes</code> in Claude Code to capture your first session.</p></div>'
    : '';

  let html = template;
  html = html.replace('{{DOMAIN}}', domain);
  html = html.replace('{{ROOT_DOMAIN}}', rootDomain);
  html = html.replace('{{NOTE_LIST_ITEMS}}', listItems);
  html = html.replace('{{NOTE_COUNT}}', String(count));
  html = html.replace('{{NOTE_COUNT_PLURAL}}', count === 1 ? '' : 's');
  html = html.replace('{{UPDATED_AT}}', updatedAt);
  html = html.replace(/{{#if_empty}}[\s\S]*?{{\/if_empty}}/, ifEmptyBlock);

  return html;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));

if (!args['uuid'] || !args['config'] || !args['plugin-root']) {
  console.error('Usage: deploy-note.mjs --uuid <uuid> --config <path> --plugin-root <path>');
  process.exit(1);
}

const uuid       = args['uuid'];
const configPath = expandPath(args['config']);
const pluginRoot = expandPath(args['plugin-root']);

// Load config
let config;
try {
  config = JSON.parse(readFileSync(configPath, 'utf8'));
} catch {
  console.error(`Could not read config at ${configPath}`);
  process.exit(1);
}

const { github_user: user, github_repo: repo, github_branch: branch, domain, output_dir } = config;
const outputDir  = expandPath(output_dir);
const rootDomain = domain.replace(/^notes\./, '');
const publicUrl  = `https://${domain}/${uuid}`;

// Check gh auth
try {
  execSync('gh auth status', { stdio: 'pipe' });
} catch {
  console.error('GitHub CLI is not authenticated. Run: gh auth login');
  process.exit(1);
}

// Load local files
const mdPath   = join(outputDir, `${uuid}.md`);
const htmlPath = join(outputDir, `${uuid}.html`);

let mdContent, htmlContent;
try {
  mdContent   = readFileSync(mdPath, 'utf8');
  htmlContent = readFileSync(htmlPath, 'utf8');
} catch (e) {
  console.error(`Could not read note files for uuid ${uuid}: ${e.message}`);
  process.exit(1);
}

// Extract title/description from markdown frontmatter
function extractMeta(md) {
  const match = md.match(/^---\n([\s\S]*?)\n---/);
  const meta = { title: uuid, description: '' };
  if (match) {
    const titleMatch = match[1].match(/^title:\s*"?(.+?)"?\s*$/m);
    const descMatch  = match[1].match(/^description:\s*"?(.+?)"?\s*$/m);
    const dateMatch  = match[1].match(/^date:\s*(.+?)\s*$/m);
    if (titleMatch) meta.title = titleMatch[1].replace(/^"|"$/g, '');
    if (descMatch)  meta.description = descMatch[1].replace(/^"|"$/g, '');
    if (dateMatch)  meta.date = dateMatch[1];
  }
  return meta;
}

const noteMeta = extractMeta(mdContent);
const updatedAt = new Date().toUTCString();

// ── Step 1: Bootstrap CNAME if it doesn't exist ───────────────────────────────

const cnameSha = getFileSha(user, repo, branch, 'CNAME');
if (!cnameSha) {
  process.stderr.write('Creating CNAME file...\n');
  uploadFile(user, repo, branch, 'CNAME', domain, `Bootstrap: add CNAME for ${domain}`, null);
}

// ── Step 2: Upload note files ─────────────────────────────────────────────────

process.stderr.write(`Uploading ${uuid}.md...\n`);
const mdSha = getFileSha(user, repo, branch, `${uuid}.md`);
uploadFile(user, repo, branch, `${uuid}.md`, mdContent, `Add note ${uuid}`, mdSha);

process.stderr.write(`Uploading ${uuid}.html...\n`);
const htmlSha = getFileSha(user, repo, branch, `${uuid}.html`);
uploadFile(user, repo, branch, `${uuid}.html`, htmlContent, `Add note ${uuid}`, htmlSha);

// ── Step 3: Update manifest.json ─────────────────────────────────────────────

process.stderr.write('Updating manifest.json...\n');

let manifest = [];
const manifestSha = getFileSha(user, repo, branch, 'manifest.json');
if (manifestSha) {
  try {
    const raw = gh(`repos/${user}/${repo}/contents/manifest.json?ref=${branch}`);
    const decoded = Buffer.from(JSON.parse(raw).content.replace(/\n/g, ''), 'base64').toString('utf8');
    manifest = JSON.parse(decoded);
  } catch {
    manifest = [];
  }
}

// Remove existing entry for this uuid if re-deploying
manifest = manifest.filter(e => e.uuid !== uuid);
manifest.push({
  uuid,
  title:       noteMeta.title,
  date:        noteMeta.date || new Date().toISOString().slice(0, 10),
  description: noteMeta.description,
  url:         publicUrl,
});

// Sort newest first
manifest.sort((a, b) => b.date.localeCompare(a.date));

uploadFile(
  user, repo, branch,
  'manifest.json',
  JSON.stringify(manifest, null, 2),
  `Update manifest: add ${uuid}`,
  manifestSha
);

// ── Step 4: Regenerate index.html ─────────────────────────────────────────────

process.stderr.write('Regenerating index.html...\n');

const indexTemplatePath = join(pluginRoot, 'assets', 'index-template.html');
let indexTemplate;
try {
  indexTemplate = readFileSync(indexTemplatePath, 'utf8');
} catch {
  console.error(`Could not read index template at ${indexTemplatePath}`);
  process.exit(1);
}

const indexHtml = buildIndexHtml(indexTemplate, manifest, domain, rootDomain, updatedAt);
const indexSha  = getFileSha(user, repo, branch, 'index.html');
uploadFile(
  user, repo, branch,
  'index.html',
  indexHtml,
  `Update index: add ${uuid}`,
  indexSha
);

// ── Done ─────────────────────────────────────────────────────────────────────

console.log(publicUrl);
