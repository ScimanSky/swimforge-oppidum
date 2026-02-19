const fs = require('fs');
const path = require('path');

const mdPath = '/home/scima/.gemini/antigravity/brain/2e091602-f471-4b0d-87e8-d9a1d942bdd7/swimforge_web3_project.md';
const outPath = '/home/scima/projects/swimforge-oppidum-cloud/swimforge_web3_project.html';

try {
    const content = fs.readFileSync(mdPath, 'utf8');

    // Extract CSS from frontmatter
    const fmMatch = content.match(/---\n([\s\S]*?)\n---/);
    let css = '';
    if (fmMatch) {
        const raw = fmMatch[1];
        const cssStart = raw.indexOf('css: |-');
        if (cssStart !== -1) {
            const cssLines = raw.slice(cssStart + 'css: |-'.length).split('\n');
            css = cssLines.map(l => l.replace(/^  /, '')).join('\n');
        }
    }

    // Body after frontmatter
    let body = content.replace(/---[\s\S]*?---\n/, '');

    // 1. Tables
    function convertTables(text) {
        const lines = text.split('\n');
        const result = [];
        let inTable = false;
        let tableRows = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('|') && line.endsWith('|')) {
                if (!inTable) { inTable = true; tableRows = []; }
                tableRows.push(line);
            } else {
                if (inTable) {
                    result.push(renderTable(tableRows));
                    tableRows = [];
                    inTable = false;
                }
                result.push(lines[i]);
            }
        }
        if (inTable) result.push(renderTable(tableRows));
        return result.join('\n');
    }

    function renderTable(rows) {
        if (rows.length < 2) return rows.join('\n');
        const headerCells = rows[0].split('|').filter(c => c.trim()).map(c => c.trim());
        const dataRows = rows.slice(2); // skip separator
        let html = '<table>\n<thead><tr>';
        headerCells.forEach(c => { html += '<th>' + inlineFormat(c) + '</th>'; });
        html += '</tr></thead>\n<tbody>\n';
        dataRows.forEach(row => {
            const cells = row.split('|').filter(c => c.trim()).map(c => c.trim());
            html += '<tr>';
            cells.forEach(c => { html += '<td>' + inlineFormat(c) + '</td>'; });
            html += '</tr>\n';
        });
        html += '</tbody></table>';
        return html;
    }

    function inlineFormat(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/~~(.*?)~~/g, '<del>$1</del>')
            .replace(/✅/g, '✅')
            .replace(/❌/g, '❌');
    }

    body = convertTables(body);

    // 2. Code blocks
    body = body.replace(/```[\w-]*\n([\s\S]*?)```/g, (m, code) => {
        return '<pre><code>' + code.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</code></pre>';
    });

    // 3. Headers
    body = body.replace(/^#### (.*$)/gm, '<h4>$1</h4>');
    body = body.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    body = body.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    body = body.replace(/^# (.*$)/gm, '<h1>$1</h1>');

    // 4. Inline formatting (outside tables)
    body = body.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    body = body.replace(/`([^`]+)`/g, '<code>$1</code>');
    body = body.replace(/~~(.*?)~~/g, '<del>$1</del>');

    // 5. Blockquotes
    body = body.replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>');
    body = body.replace(/<\/blockquote>\n<blockquote>/g, '<br>');

    // 6. Horizontal Rules
    body = body.replace(/^---$/gm, '<hr>');

    // 7. Paragraphs
    const pLines = body.split('\n');
    const pResult = [];
    for (const line of pLines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('<') && !trimmed.startsWith('|') && trimmed !== '') {
            pResult.push('<p>' + trimmed + '</p>');
        } else {
            pResult.push(line);
        }
    }
    body = pResult.join('\n');

    // HTML Template
    const fullHtml = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SwimForge — Social First + Web3 Token Economy</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
${css}
/* Print overrides to ensure background colors print */
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style>
</head>
<body>
${body}
</body>
</html>`;

    fs.writeFileSync(outPath, fullHtml);
    console.log('HTML generato con successo:', outPath);

} catch (err) {
    console.error('Errore:', err);
}
