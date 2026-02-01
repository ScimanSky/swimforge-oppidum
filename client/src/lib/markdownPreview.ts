const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const formatInline = (value: string) =>
  value
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");

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

    if (!trimmed) {
      html += "<br />";
      continue;
    }

    if (trimmed.startsWith("### ")) {
      html += `<h4>${formatInline(trimmed.replace(/^###\s+/, ""))}</h4>`;
    } else if (trimmed.startsWith("## ")) {
      html += `<h3>${formatInline(trimmed.replace(/^##\s+/, ""))}</h3>`;
    } else if (trimmed.startsWith("# ")) {
      html += `<h2>${formatInline(trimmed.replace(/^#\s+/, ""))}</h2>`;
    } else {
      html += `<p>${formatInline(trimmed)}</p>`;
    }
  }

  if (inList) {
    html += "</ul>";
  }

  return html;
};
