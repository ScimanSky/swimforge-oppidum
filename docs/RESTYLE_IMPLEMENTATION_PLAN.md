# SwimForge 4.5 Restyle - Piano Implementativo

## Obiettivo
Rendere l'interfaccia chiaramente riconoscibile come SwimForge con una direzione "Water + Forge": brand anchor sempre visibile, gerarchia tipografica più sport-tech, feed distinguibile tra attività e post social, micro-motion leggere e copy più tematico.

## Sequenza di rilascio (pratica)
1. Brand anchor (sidebar/header + entry points)
2. Design tokens e regole colore accento
3. Tipografia display su heading/metriche chiave
4. Feed identity (attività vs social)
5. Copy/UI states e micro-motion leggera

## Task Per Componente

### 1) Foundation / Tokens
- **File:** `client/src/index.css`
- **Task:** introdurre token "forge" a basso impatto e regole brand riusabili
- **Implementato:**
  - Aggiunti token `--forge-orange`, `--forge-orange-soft`, `--forge-glow`
  - Aggiornata font stack display/sans
  - Nuove classi globali: `.sf-brand-anchor`, `.sf-wordmark`, `.sf-activity-card`, `.sf-social-card`, `.sf-activity-badge`
- **Verifica:** controllare contrasto AA su dark mode per badge/arancio

### 2) Brand Components
- **File:** `client/src/components/brand/SwimForgeBrand.tsx`
- **Task:** centralizzare mark + wordmark in un componente riusabile
- **Implementato:**
  - `SwimForgeMark` (icona)
  - `SwimForgeWordmark` (logotipo testuale)
- **Asset:** `client/public/brand/swimforge-mark.svg`

### 3) App Shell (Brand Anchor)
- **File:** `client/src/components/app/app-shell.tsx`
- **Task:** ancorare brand in rail desktop e top bar globale
- **Implementato:**
  - Rail desktop con mark flat e glow coerente
  - Top bar con brand anchor persistente (wordmark ridotto nel Feed per evitare crowding)
- **Verifica:** su mobile assicurare che stories + azioni header restino leggibili

### 4) Feed Identity
- **File:** `client/src/components/social/FeedPost.tsx`
- **Task:** separare in modo netto card attività da card social
- **Implementato:**
  - Rilevazione attività più robusta (`activity_id`/`activity_source`/metriche)
  - Card attività con stile certificato + badge "Allenamento certificato"
  - Card social con stile neutro dedicato

- **File:** `client/src/components/social/FeedPostMetrics.tsx`
- **Task:** usare accento "forge" solo per segnali energia/calorie
- **Implementato:**
  - Nuova palette `forge` nelle metric chips

- **File:** `client/src/components/social/FeedSubTabs.tsx`
- **Task:** migliorare leggibilità e identità del selettore Per te/Seguiti
- **Implementato:**
  - Restyle contenitore + active pill con gradiente water+forge

- **File:** `client/src/pages/SocialFeed.tsx`
- **Task:** evitare sovrapposizione tabs con contenuti e migliorare copy
- **Implementato:**
  - Tabs rese sticky con spacing e background più stabili
  - Copy tematico su empty states

- **File:** `client/src/components/social/FeedSidebar.tsx`
- **Task:** copy stato vuoto meno generico
- **Implementato:** testo empty state aggiornato

### 5) Landing / Auth Consistency
- **File:** `client/src/components/landing/nav.tsx`
- **Task:** sostituire logo legacy con nuovo anchor
- **Implementato:** anchor brand unificato

- **File:** `client/src/components/landing/footer.tsx`
- **Task:** stessa identità brand del nav
- **Implementato:** anchor brand unificato

- **File:** `client/src/pages/Home.tsx`
- **Task:** coerenza hero/header/footer
- **Implementato:** brand anchor e wordmark uniformati, heading principale in display

- **File:** `client/src/pages/Auth.tsx`
- **Task:** coerenza brand nel gateway login/register
- **Implementato:** blocco brand aggiornato con mark + wordmark

## Backlog successivo (non bloccante)
1. Sostituzione mark temporaneo con logo definitivo da Manus (A/B test rapido)
2. Applicare token "forge" solo a pattern funzionali (streak, CTA critiche, badge record)
3. Revisione micro-motion su componenti ad alta frequenza (hover feed cards e CTA hero)
4. QA cross-device: iOS Safari, Android Chrome, desktop low-res
