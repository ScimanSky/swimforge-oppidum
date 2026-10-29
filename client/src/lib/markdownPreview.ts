const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const formatInline = (value: string) =>
  value
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");

/**
 * Splits the leading «# Title» line off a document (the page shows it as its own title).
 * Without such a line the title is empty and the body is the whole text.
 */
export const splitMarkdownTitle = (text: string): { title: string; body: string } => {
  const match = /^\s*#[ \t]+(.+?)[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) return { title: "", body: text };
  return { title: match[1], body: text.slice(match[0].length) };
};

/**
 * The small Markdown subset of the legal documents, as HTML: headings (`##` → h2 … `####` →
 * h4; a stray `#` is an h2, the page title being the page's own h1), paragraphs, bullet lists,
 * `---` rules, bold, italic and `code`. The text is escaped first.
 */
export const renderMarkdownPreview = (text: string) => {
  const escaped = escapeHtml(text);
  const lines = escaped.split(/\r?\n/);
  let html = "";
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const listMatch = /^[-*]\s+(.+)$/.exec(trimmed);
    if (listMatch) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${formatInline(listMatch[1])}</li>`;
      continue;
    }

    if (inList) {
      html += "</ul>";
      inList = false;
    }

    // Blank lines only separate blocks: the spacing comes from the page's styles.
    if (!trimmed) continue;

    const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (/^-{3,}$/.test(trimmed)) {
      html += "<hr />";
    } else if (heading) {
      const level = Math.max(2, heading[1].length);
      html += `<h${level}>${formatInline(heading[2])}</h${level}>`;
    } else {
      html += `<p>${formatInline(trimmed)}</p>`;
    }
  }

  if (inList) {
    html += "</ul>";
  }

  return html;
};
