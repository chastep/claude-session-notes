#!/usr/bin/env node
/**
 * generate-note.mjs
 * Generates a UUID, writes the markdown file, renders HTML from the note template.
 *
 * Usage:
 *   node generate-note.mjs \
 *     --summary-file /tmp/session-notes-summary.md \
 *     --config ~/.claude/notes-publisher/config.json \
 *     --plugin-root /path/to/session-notes
 *
 * Outputs JSON to stdout: { uuid, md_path, html_path, public_url }
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { randomBytes } from 'crypto';
import { resolve, join, dirname } from 'path';
import { homedir } from 'os';

// ── Arg parsing ──────────────────────────────────────────────────────────────

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

function expandPath(p) {
  return p.replace(/^~/, homedir());
}

// ── UUID ─────────────────────────────────────────────────────────────────────

function generateUUID() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const hex = randomBytes(4).toString('hex');
  return `${dateStr}-${hex}`;
}

// ── Markdown → HTML converter ─────────────────────────────────────────────────
// Handles the structured output we generate: headings, bullets, fenced code,
// task lists, bold, italic, inline code. No external deps.

function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;

  function escapeHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function inlineFormat(s) {
    // Bold
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
    // Italic
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/_(.+?)_/g, '<em>$1</em>');
    // Inline code
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Links
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    return s;
  }

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      out.push(`<pre><code${langAttr}>${codeLines.join('\n')}</code></pre>`);
      i++;
      continue;
    }

    // ATX headings
    const h3 = line.match(/^### (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h1 = line.match(/^# (.+)/);
    if (h3) { out.push(`<h3>${inlineFormat(escapeHtml(h3[1]))}</h3>`); i++; continue; }
    if (h2) { out.push(`<h2>${inlineFormat(escapeHtml(h2[1]))}</h2>`); i++; continue; }
    if (h1) { out.push(`<h2>${inlineFormat(escapeHtml(h1[1]))}</h2>`); i++; continue; } // h1 → h2 (title already shown in header)

    // Unordered list (including task list items)
    if (line.match(/^(\s*)[-*+] /)) {
      const listLines = [];
      while (i < lines.length && lines[i].match(/^(\s*)[-*+] /)) {
        const content = lines[i].replace(/^(\s*)[-*+] /, '');
        // Task list checkbox
        const taskDone = content.match(/^\[x\] (.+)/i);
        const taskOpen = content.match(/^\[ \] (.+)/);
        if (taskDone) {
          listLines.push(`<li><input type="checkbox" checked disabled> ${inlineFormat(escapeHtml(taskDone[1]))}</li>`);
        } else if (taskOpen) {
          listLines.push(`<li><input type="checkbox" disabled> ${inlineFormat(escapeHtml(taskOpen[1]))}</li>`);
        } else {
          listLines.push(`<li>${inlineFormat(escapeHtml(content))}</li>`);
        }
        i++;
      }
      out.push(`<ul>${listLines.join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (line.match(/^\d+\. /)) {
      const listLines = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        const content = lines[i].replace(/^\d+\. /, '');
        listLines.push(`<li>${inlineFormat(escapeHtml(content))}</li>`);
        i++;
      }
      out.push(`<ol>${listLines.join('')}</ol>`);
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(inlineFormat(escapeHtml(lines[i].slice(2))));
        i++;
      }
      out.push(`<blockquote><p>${quoteLines.join('<br>')}</p></blockquote>`);
      continue;
    }

    // Horizontal rule
    if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph
    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].match(/^[#>\-*+`]/) && !lines[i].match(/^\d+\. /)) {
      paraLines.push(inlineFormat(escapeHtml(lines[i])));
      i++;
    }
    if (paraLines.length) {
      out.push(`<p>${paraLines.join(' ')}</p>`);
    } else {
      i++;
    }
  }

  return out.join('\n');
}

// ── Entity escape for <pre> content ──────────────────────────────────────────

function escapeForPre(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Frontmatter extraction ────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const meta = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*"?(.+?)"?$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return { meta, body: match[2] };
}

// ── Template substitution ─────────────────────────────────────────────────────

function applyTemplate(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value ?? '');
  }
  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));

if (!args['summary-file'] || !args['config'] || !args['plugin-root']) {
  console.error('Usage: generate-note.mjs --summary-file <path> --config <path> --plugin-root <path>');
  process.exit(1);
}

const summaryPath  = expandPath(args['summary-file']);
const configPath   = expandPath(args['config']);
const pluginRoot   = expandPath(args['plugin-root']);
const templatePath = join(pluginRoot, 'assets', 'note-template.html');

// Load config
let config;
try {
  config = JSON.parse(readFileSync(configPath, 'utf8'));
} catch {
  console.error(`Could not read config at ${configPath}`);
  process.exit(1);
}

const outputDir = expandPath(config.output_dir);
mkdirSync(outputDir, { recursive: true });

// Load summary markdown
let rawMarkdown;
try {
  rawMarkdown = readFileSync(summaryPath, 'utf8');
} catch {
  console.error(`Could not read summary file at ${summaryPath}`);
  process.exit(1);
}

// Load HTML template
let htmlTemplate;
try {
  htmlTemplate = readFileSync(templatePath, 'utf8');
} catch {
  console.error(`Could not read note template at ${templatePath}`);
  process.exit(1);
}

// Parse frontmatter
const { meta, body } = parseFrontmatter(rawMarkdown);
const uuid  = generateUUID();
const today = new Date();
const dateStr = today.toISOString().slice(0, 10);
const generatedAt = today.toUTCString();

const title       = meta.title || 'Session Notes';
const description = meta.description || '';
const domain      = config.domain; // e.g. "notes.thethoughtdungeon.com"
const rootDomain  = domain.replace(/^notes\./, ''); // e.g. "thethoughtdungeon.com"
const publicUrl   = `https://${domain}/${uuid}`;

// Update frontmatter with uuid and generated date
const updatedFrontmatter = `---
title: "${title}"
uuid: ${uuid}
date: ${dateStr}
published_at: ${today.toISOString()}
description: "${description}"
---`;

const finalMarkdown = `${updatedFrontmatter}\n${body}`;

// Write markdown file
const mdPath = join(outputDir, `${uuid}.md`);
writeFileSync(mdPath, finalMarkdown, 'utf8');

// Render HTML from markdown body (skip frontmatter for display)
const renderedHtml = mdToHtml(body);
const rawMarkdownEscaped = escapeForPre(finalMarkdown);

// Format display date
const displayDate = today.toLocaleDateString('en-US', {
  year: 'numeric', month: 'long', day: 'numeric'
});

// Substitute template
const htmlContent = applyTemplate(htmlTemplate, {
  TITLE:         title,
  UUID:          uuid,
  DATE:          displayDate,
  DOMAIN:        domain,
  ROOT_DOMAIN:   rootDomain,
  PUBLIC_URL:    publicUrl,
  RENDERED_HTML: renderedHtml,
  RAW_MARKDOWN:  rawMarkdownEscaped,
  GENERATED_AT:  generatedAt,
  DESCRIPTION:   description,
});

// Write HTML file
const htmlPath = join(outputDir, `${uuid}.html`);
writeFileSync(htmlPath, htmlContent, 'utf8');

// Output result JSON
console.log(JSON.stringify({ uuid, md_path: mdPath, html_path: htmlPath, public_url: publicUrl }, null, 2));
