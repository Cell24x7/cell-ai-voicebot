/**
 * A tiny, safe Markdown subset for the legal pages (Phase 13): headings `#`–`###`,
 * paragraphs, `-` lists, `**bold**` and `[text](https://… | /path | mailto:…)` links.
 * Everything else stays plain text; nothing is ever rendered as HTML.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'link'; text: string; href: string };

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; inline: Inline[] }
  | { kind: 'paragraph'; inline: Inline[] }
  | { kind: 'list'; items: Inline[][] };

export interface LegalDoc {
  meta: Record<string, string>;
  blocks: Block[];
}

/** Only these link targets are kept; anything else (e.g. `javascript:`) becomes text. */
export const safeHref = (href: string): string | null => {
  const h = href.trim();
  // Browsers normalize backslashes and strip embedded control characters. Reject
  // those before deciding whether an app path is confined to this origin.
  // eslint-disable-next-line no-control-regex -- intentionally reject URL controls
  if (/[\\\u0000-\u0020\u007f]/u.test(h)) return null;
  if (h.startsWith('/') && !h.startsWith('//')) return h;
  if (/^mailto:[^\s]+@[^\s]+$/i.test(h)) return h;
  if (/^https:\/\/[^\s]+$/i.test(h)) return h;
  return null;
};

const TOKEN = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export const parseInline = (line: string): Inline[] => {
  const out: Inline[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    const at = m.index;
    if (at > last) out.push({ kind: 'text', text: line.slice(last, at) });
    if (m[1] !== undefined) out.push({ kind: 'bold', text: m[1] });
    else {
      const text = m[2] ?? '';
      const href = safeHref(m[3] ?? '');
      out.push(href ? { kind: 'link', text, href } : { kind: 'text', text });
    }
    last = at + m[0].length;
  }
  if (last < line.length) out.push({ kind: 'text', text: line.slice(last) });
  return out;
};

/** `---\nkey: value\n---` front matter (string values only). */
const frontMatter = (source: string): { meta: Record<string, string>; body: string } => {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(source);
  if (!m) return { meta: {}, body: source };
  const meta: Record<string, string> = {};
  for (const line of (m[1] ?? '').split('\n')) {
    const at = line.indexOf(':');
    if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return { meta, body: source.slice(m[0].length) };
};

export const parseLegal = (source: string): LegalDoc => {
  const { meta, body } = frontMatter(source.replace(/\r\n?/g, '\n'));
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: Inline[][] | null = null;
  const flush = () => {
    if (para.length) blocks.push({ kind: 'paragraph', inline: parseInline(para.join(' ')) });
    para = [];
    if (list) blocks.push({ kind: 'list', items: list });
    list = null;
  };
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = (heading[1] ?? '#').length as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, inline: parseInline(heading[2] ?? '') });
      continue;
    }
    const item = /^-\s+(.*)$/.exec(line);
    if (item) {
      if (para.length) {
        blocks.push({ kind: 'paragraph', inline: parseInline(para.join(' ')) });
        para = [];
      }
      list ??= [];
      list.push(parseInline(item[1] ?? ''));
      continue;
    }
    if (list) flush();
    para.push(line);
  }
  flush();
  return { meta, blocks };
};

/** Fills `{{name}}` placeholders; unknown names stay as they are. */
export const fillPlaceholders = (source: string, values: Record<string, string>): string =>
  source.replace(/\{\{(\w+)\}\}/g, (all, name: string) => values[name] ?? all);
