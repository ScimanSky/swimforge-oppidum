# SwimForge PDF Generation Guide

Hai due modi alternativi per generare il PDF della roadmap "Social First + Web3".

## Metodo 1: Browser (Consigliato & Più Semplice)

Questo metodo usa il browser per renderizzare il documento con tutto lo stile corretto (tema scuro, tabelle, colori).

1.  **Apri il file HTML** nel tuo browser preferito (Chrome, Edge, Safari, Firefox):
    - File: `swimforge_web3_project.html`
    - (Trovi questo file nella root del progetto)

2.  **Stampa come PDF**:
    - Premi `Ctrl + P` (o `Cmd + P` su Mac).
    - Seleziona come destinazione: **"Salva come PDF"** (o "Microsoft Print to PDF").
    - **Importante**: Nelle impostazioni di stampa, abilita l'opzione **"Grafica in background"** (o "Background graphics"). Senza questa opzione, lo sfondo scuro e i colori dei box non verranno stampati!
    - Imposta formato carta su **A4**.
    - Clicca **Salva**.

## Metodo 2: Script Node.js (Avanzato)

Se preferisci generare il PDF via riga di comando usando lo script che ho creato:

1.  Assicurati di avere Node.js installato.
2.  Installa la dipendenza necessaria (in una cartella temporanea se preferisci non sporcare il progetto, oppure nel progetto stesso):
    ```bash
    npm install pdfkit
    ```
3.  Esegui lo script:
    ```bash
    node generate_pdf_with_pdfkit.mjs
    ```
4.  Il file `SwimForge_Web3_Project.pdf` verrà generato nella cartella corrente.

---

**Nota:** Il contenuto sorgente è sempre disponibile nel file markdown `swimforge_web3_project.md` se desideri usare altri tool (es. Pandoc, plugin VS Code).
