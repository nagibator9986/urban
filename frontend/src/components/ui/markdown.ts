// Минимальный Markdown→HTML рендерер. Без зависимостей.
// Поддерживает: #..###, **bold**, *italic*, `code`, списки, абзацы.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const esc = escapeHtml;

/**
 * Sanitize HTML coming from backend that intentionally contains tags like
 * <b>, <strong>, <em>, <br>. Strips everything else (no script, no event handlers).
 */
export function sanitizeBackendHtml(html: string): string {
  if (!html) return "";
  // Remove script/style blocks entirely (with content)
  let s = html.replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, "");
  // Remove event handlers: on*="..."
  s = s.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  s = s.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  // Remove javascript: hrefs
  s = s.replace(/\s(href|src)\s*=\s*["']?\s*javascript:[^"'>\s]*["']?/gi, "");
  // Allow only whitelisted tags; strip everything else.
  const allowed = /^(b|strong|em|i|u|br|p|ul|ol|li|h1|h2|h3|span)$/i;
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag) => {
    if (!allowed.test(tag)) return "";
    // For allowed tags strip all attributes (no class, no style — neutral)
    return match.startsWith("</") ? `</${tag.toLowerCase()}>` : `<${tag.toLowerCase()}>`;
  });
  return s;
}

function inline(s: string): string {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function renderMarkdown(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;

  const flushList = () => {
    if (inList) { out.push("</ul>"); inList = false; }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) { flushList(); out.push(""); continue; }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flushList();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(line.replace(/^\d+\.\s+/, ""))}</li>`);
      continue;
    }

    flushList();
    out.push(`<p>${inline(line)}</p>`);
  }
  flushList();
  return out.join("\n");
}
