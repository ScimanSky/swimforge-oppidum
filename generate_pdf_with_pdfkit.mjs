import PDFDocument from 'pdfkit';
import fs from 'fs';

// Configuration
const CONFIG = {
    outPath: './SwimForge_Web3_Project.pdf',
    pageSize: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    theme: {
        bg: '#0d1117',
        surface: '#161b22',
        brand: '#9945FF',
        brandLight: '#c4a1ff',
        accent: '#14F195',
        text: '#c9d1d9',
        textBright: '#f0f6fc',
        border: '#30363d',
        warn: '#f59e0b',
        danger: '#f85149',
        success: '#3fb950',
        white: '#ffffff',
        black: '#000000'
    }
};

const doc = new PDFDocument({
    size: CONFIG.pageSize,
    margins: CONFIG.margins,
    info: {
        Title: 'SwimForge — Social First + Web3 Token Economy',
        Author: 'SwimForge Team',
        Subject: 'Project Roadmap v2.0',
        CreationDate: new Date()
    }
});

const stream = fs.createWriteStream(CONFIG.outPath);
doc.pipe(stream);

const C = CONFIG.theme;
const W = 495; // usable width (595 - 50 - 50)

// Helper Functions
function drawBg(newPage = true) {
    if (newPage) doc.addPage();
    doc.save();
    doc.rect(0, 0, 595, 842).fill(C.bg);
    doc.restore();
}

function h1(text, y) {
    doc.font('Helvetica-Bold').fontSize(22).fillColor(C.textBright);
    if (y) doc.text(text, 50, y, { width: W }); else doc.text(text, { width: W });
    doc.moveDown(0.3);
    doc.save().strokeColor(C.brand).lineWidth(2);
    const ly = doc.y;
    doc.moveTo(50, ly).lineTo(545, ly).stroke();
    doc.restore();
    doc.moveDown(0.8);
}

function h2(text) {
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(16).fillColor(C.accent).text(text, { width: W });
    doc.moveDown(0.3);
    doc.save().strokeColor(C.border).lineWidth(0.5);
    const ly = doc.y;
    doc.moveTo(50, ly).lineTo(545, ly).stroke();
    doc.restore();
    doc.moveDown(0.5);
}

function h3(text) {
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(C.brandLight).text(text, { width: W });
    doc.moveDown(0.3);
}

function para(text) {
    doc.font('Helvetica').fontSize(10).fillColor(C.text).text(text, { width: W, lineGap: 3 });
    doc.moveDown(0.3);
}

function quote(text) {
    const x = 50;
    const startY = doc.y;
    doc.save();
    doc.rect(x, startY, W, 30).fill('rgba(153, 69, 255, 0.08)');
    doc.strokeColor(C.brand).lineWidth(2).moveTo(x, startY).lineTo(x, startY + 30).stroke();
    doc.restore();
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(C.textBright).text(text, x + 10, startY + 8, { width: W - 20 });
    doc.moveDown(0.5);
}

function highlightBox(text, type = 'info') {
    const x = 50;
    const startY = doc.y;
    let color = C.accent;
    let bg = '#0a2a1a';

    if (type === 'warn') { color = C.warn; bg = '#2a1f0a'; }
    if (type === 'danger') { color = C.danger; bg = '#2a0a0a'; }

    doc.save();
    doc.roundedRect(x, startY, W, 40, 4).fill(bg);
    doc.roundedRect(x, startY, W, 40, 4).strokeColor(color).lineWidth(1).stroke();
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(color).text(text, x + 12, startY + 12, { width: W - 24 });
    doc.y = startY + 48;
}

function codeBlock(text) {
    if (doc.y + 60 > 780) drawBg();
    const x = 50;
    const startY = doc.y;
    const lines = text.split('\n');
    const blockH = lines.length * 12 + 16;
    doc.save();
    doc.roundedRect(x, startY, W, blockH, 4).fill(C.surface);
    doc.roundedRect(x, startY, W, blockH, 4).strokeColor(C.border).lineWidth(0.5).stroke();
    doc.restore();
    doc.font('Courier').fontSize(7.5).fillColor(C.text);
    lines.forEach((line, i) => {
        doc.text(line, x + 10, startY + 8 + i * 12, { width: W - 20 });
    });
    doc.y = startY + blockH + 8;
}

function drawTable(headers, rows, colWidths) {
    const x = 50;
    const rowH = 22;
    const headerH = 24;
    const fontSize = 8;
    const neededHeight = headerH + rows.length * rowH + 10;
    if (doc.y + neededHeight > 780) drawBg();

    let y = doc.y;
    // Header
    doc.save(); doc.rect(x, y, W, headerH).fill(C.brand); doc.restore();
    let cx = x;
    headers.forEach((h, i) => {
        doc.font('Helvetica-Bold').fontSize(fontSize - 1).fillColor(C.white);
        doc.text(h.toUpperCase(), cx + 5, y + 6, { width: colWidths[i] - 10, ellipsis: true });
        cx += colWidths[i];
    });
    y += headerH;

    // Rows
    rows.forEach((row, ri) => {
        if (y + rowH > 780) {
            drawBg(); y = 50;
            doc.save(); doc.rect(x, y, W, headerH).fill(C.brand); doc.restore();
            let cx2 = x;
            headers.forEach((h, i) => {
                doc.font('Helvetica-Bold').fontSize(fontSize - 1).fillColor(C.white);
                doc.text(h.toUpperCase(), cx2 + 5, y + 6, { width: colWidths[i] - 10, ellipsis: true });
                cx2 += colWidths[i];
            });
            y += headerH;
        }
        const bgColor = ri % 2 === 0 ? C.bg : '#12161d';
        doc.save(); doc.rect(x, y, W, rowH).fill(bgColor);
        doc.rect(x, y + rowH - 0.5, W, 0.5).fill(C.border); doc.restore();
        let cx2 = x;
        row.forEach((cell, i) => {
            doc.font('Helvetica').fontSize(fontSize).fillColor(C.text);
            doc.text(String(cell), cx2 + 5, y + 5, { width: colWidths[i] - 10, ellipsis: true, height: rowH - 5 });
            cx2 += colWidths[i];
        });
        y += rowH;
    });
    doc.y = y + 10;
}

function footer() {
    doc.font('Helvetica').fontSize(7).fillColor('#555');
    doc.text('SwimForge — Confidential', 50, 810, { width: W, align: 'center' });
}

// ------------------------------------------------------------------
// CONTENT GENERATION
// ------------------------------------------------------------------

// Cover Page
doc.rect(0, 0, 595, 842).fill(C.bg);
doc.save(); doc.rect(50, 300, W, 3).fill(C.brand); doc.restore();
doc.font('Helvetica-Bold').fontSize(42).fillColor(C.brandLight);
doc.text('SwimForge', 50, 320, { width: W, align: 'center' });
doc.font('Helvetica').fontSize(18).fillColor(C.text);
doc.text('Social First + Web3 Token Economy', 50, 380, { width: W, align: 'center' });

// Badges
const badges = ['🪙 $SWIM Token', '⛓️ Solana', '🏊 Swim-to-Earn'];
const badgeY = 430; const badgeW = 140;
const startX = (595 - badges.length * badgeW - (badges.length - 1) * 10) / 2;
badges.forEach((b, i) => {
    const bx = startX + i * (badgeW + 10);
    doc.save(); doc.roundedRect(bx, badgeY, badgeW, 28, 14).strokeColor(C.brand).lineWidth(1).stroke(); doc.restore();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.brandLight);
    doc.text(b, bx, badgeY + 8, { width: badgeW, align: 'center' });
});

// Meta
doc.font('Helvetica').fontSize(10).fillColor('#555');
doc.text('Versione: 2.0 — Solana + Multi-Wallet', 50, 520, { width: W, align: 'center' });
doc.text('Data: ' + new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }), 50, 538, { width: W, align: 'center' });
doc.text('Classificazione: Confidential', 50, 574, { width: W, align: 'center' });

// TOC
drawBg();
h1('Indice', 50);
const toc = [
    ['1', 'Riepilogo Esecutivo', 'Panoramica del progetto'],
    ['2', 'Token Economy ($SWIM)', 'Earn/Spend mechanics'],
    ['3', 'Architettura Tecnica', 'Hybrid off-chain/on-chain'],
    ['4', 'Architettura App', '4 Tab flow'],
    ['5', 'Flusso Utente', 'Journey'],
    ['6', 'Anti-Cheat', '5 livelli di protezione'],
    ['7', 'Roadmap', '5 fasi, 11-15 settimane'],
    ['8', 'Confronto Stipe vs Web3', 'Analisi'],
    ['9', 'Decision Points', 'Decisioni aperte'],
];
drawTable(['#', 'Sezione', 'Contenuto'], toc, [30, 200, 265]);
footer();

// 1. Executive
drawBg(); h1('1. Riepilogo Esecutivo', 50);
para('SwimForge si evolve da app di tracking a piattaforma Social-First con monetizzazione Web3 (Swim-to-Earn).');
drawTable(['Dimensione', 'Stato Attuale', 'Target Social+Web3'], [
    ['Navigazione', '6 tab', '4 tab (Social, Season, Track, Profilo)'],
    ['Social', 'Secondario', 'Feed principale (70%)'],
    ['Monetizzazione', 'Assente', '$SWIM Token Economy'],
    ['Badge', 'Statici', 'NFT su Solana'],
], [100, 130, 265]);
h3('Vision'); quote('"Nuota, Guadagna, Sblocca" — Ogni metro genera valore.');
footer();

// 2. Token Economy
drawBg(); h1('2. Token Economy — $SWIM', 50);
h2('2.1 Earn Mechanics');
drawTable(['Azione', '$SWIM', 'Frequenza'], [
    ['Sync attività', '10 + (km × 2)', 'Max 3/gg'],
    ['Season: obiettivo', '50-100', 'Mensile'],
    ['Challenge vinta', '90/60/30', 'Per challenge'],
    ['Streak 7gg', '20 bonus', 'Settimanale'],
    ['Referral', '50 + 25', 'Una tantum'],
], [130, 100, 265]);
h2('2.2 Spend Mechanics');
drawTable(['Azione', 'Costo $SWIM', 'Tipo'], [
    ['Coach AI: 1 piano', '50', 'Consumabile'],
    ['Coach AI: 7 giorni', '100', 'Abbonamento'],
    ['Mint Badge NFT', '20', 'Permanente'],
], [150, 100, 245]);
highlightBox('Deflazionario by design: tokens spesi vengono bruciati.');
footer();

// 3. Technical
drawBg(); h1('3. Architettura Tecnica', 50);
h2('3.1 Blockchain: Solana');
drawTable(['Criterio', 'Solana ✅', 'Base L2'], [
    ['Gas fees', '~$0.001', '< $0.01'],
    ['TPS', '~65k', '~1k'],
    ['Finalità', '~400ms', '~2s'],
], [100, 150, 245]);
h2('3.2 Schema Database');
codeBlock(`CREATE TABLE swim_token_balances (
  user_id INT UNIQUE,
  balance INT DEFAULT 0
);\n
CREATE TABLE user_wallets (
  user_id INT,
  wallet_address TEXT UNIQUE,
  provider TEXT -- phantom, backpack
);`);
footer();

// 4. App
drawBg(); h1('4. Architettura App', 50);
drawTable(['Tab', 'Contenuto'], [
    ['Social Home', 'Feed, gruppi'],
    ['Season', 'Obiettivi, rewards'],
    ['Track', 'Sync veloce'],
    ['Profilo', 'Wallet, NFT, stats'],
], [100, 395]);
codeBlock(`Coach Flow:\nUtente ha >= 50 $SWIM?\n -> SI: Sblocca piano (-50 $SWIM)\n -> NO: "Nuota per sbloccare!"`);
footer();

// 5. User Flow
drawBg(); h1('5. Flusso Utente', 50);
drawTable(['Week', 'Earn', 'Spend', 'Balance'], [
    ['W1', '62', '0', '62'],
    ['W2', '42', '50 (Coach)', '54'],
    ['W3', '42', '0', '96'],
    ['W4', '92 (Season)', '70 (NFT+Coach)', '118'],
], [50, 100, 100, 245]);
footer();

// 6. Anti-Cheat
drawBg(); h1('6. Anti-Cheat', 50);
highlightBox('CRITICO: Validazione a 5 livelli per prevenire farming.', 'danger');
drawTable(['Livello', 'Controllo'], [
    ['L1', 'Source verification (Garmin/Strava only)'],
    ['L2', 'Pace plausibility check'],
    ['L3', 'Heart Rate correlation'],
    ['L4', 'Daily cap frequency'],
    ['L5', 'ML Anomaly detection (future)'],
], [50, 445]);
footer();

// 7. Roadmap
drawBg(); h1('7. Roadmap', 50);
drawTable(['Fase', 'Focus', 'Durata'], [
    ['1', 'Social Foundations', '2-3 sett'],
    ['2', 'Season + Token Earn', '3 sett'],
    ['3', 'Coach Swim-to-Unlock', '2-3 sett'],
    ['4', 'NFT + On-chain (Solana)', '3-4 sett'],
    ['5', 'Polish + Lancio', '1-2 sett'],
], [30, 265, 200]);
footer();

// 8. Vs Stripe
drawBg(); h1('8. Stripe vs Web3', 50);
drawTable(['Aspetto', 'Stripe', 'Web3 $SWIM'], [
    ['Barriera', 'Carta di credito', 'Zero (guadagni nuotando)'],
    ['Retention', 'Churn risk', 'High engagement'],
    ['Cost', '2.9% + fees', '< $0.001 (Solana)'],
], [100, 150, 245]);
footer();

// 9. Decisions
drawBg(); h1('9. Decision Points', 50);
drawTable(['#', 'Decisione', 'Default'], [
    ['1', 'Token Name', '$SWIM'],
    ['2', 'Earn Rate', '10 + 2/km'],
    ['3', 'Coach Cost', '50 $SWIM'],
    ['4', 'Chain', 'Solana'],
    ['5', 'NFT Type', 'Compressed (cNFT)'],
], [30, 200, 265]);
footer();

doc.end();
stream.on('finish', () => {
    console.log('✅ PDF generated:', CONFIG.outPath);
});
