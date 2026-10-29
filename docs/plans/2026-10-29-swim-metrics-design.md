# Metriche di nuoto con fondamento reale: design (29 ottobre 2026)

Stato: **richiesto dal proprietario il 29/10/2026** («le metriche inventate con calcoli sbagliati
devono sparire ed essere sostituite da metriche reali e sensate, e il coach le deve poter
leggere»; le scelte di dettaglio le ha delegate a noi). Sostituisce la sezione «Analisi avanzate»
di Allena → Statistiche e i numeri che oggi arrivano al coach.

## 1. Perché
La verifica del 29/10 (`server/advanced_metrics.ts`, `server/db_statistics.ts`,
`client/src/data/metricsDefinitions.ts`) ha trovato otto punteggi compositi (SEI, TCI, SER, ACS,
Recupero, Carico progressivo, Prestazione, Costanza) senza riscontro in letteratura: pesi e valori
«ottimali» arbitrari, uguali per tutti. In più ci sono errori di calcolo:
- il SEI non legge mai lo SWOLF (`swolfScore` invece di `avgSwolf`);
- l'ACS non supera mai 50;
- la Costanza non supera mai 80;
- la serie conta solo lunedì, mercoledì e venerdì, per tutti;
- il TCI non misura quello che dice la sua descrizione.

Il coach (chat e suggerimenti della pagina Coach) riceve questi numeri.

## 2. Principi
- Ogni metrica ha una fonte riconosciuta (studio o metodo usato da allenatori) oppure è una misura
  diretta. Le soglie che sono convenzioni lo dicono esplicitamente.
- I confronti sono con **te stesso** (la tua media recente, stessa vasca e stesso stile), mai con
  valori da campione.
- Si mostra sempre su quali dati è calcolata («su 18 nuotate con i giri, ultimi 90 giorni») e,
  quando i dati non bastano, si dice cosa manca invece di mostrare un numero inventato.
- Una sola definizione per interfaccia e coach (stesso testo, stesse formule).

## 3. Dati usati
`swimming_activities` (distanza, durata, passo, SWOLF, vasca, stile, acque libere, zone FC),
`garmin_activity_laps` (giri: distanza, tempo in movimento, bracciate, SWOLF, stile, FC; i giri con
distanza 0 sono recuperi), `garmin_activity_lengths` (vasche). Un giro attivo di Garmin è nuoto
continuo tra due recuperi. Le nuotate senza giri contano solo dove basta il dato complessivo.
Una «bracciata» di Garmin è un ciclo completo del braccio con l'orologio, quindi la distanza per
bracciata (DPS) è in metri per ciclo, come negli studi.

## 4. Le sei metriche

### 4.1 Passo soglia (CSS, velocità critica)
- **Fonte:** velocità critica (Wakayoshi et al., 1992); versione 400/200 (Ginn, 1993); è il
  riferimento di Swim Smooth, British Triathlon e TrainingPeaks.
- **Stima automatica:** migliori giri continui a stile libero, in vasca, degli ultimi 90 giorni,
  sulle distanze 200, 300, 400, 500, 600, 800, 1000, 1500 m (il miglior tempo per distanza).
  Regressione lineare distanza = CS × tempo + D′ sui punti tra 2 e 30 minuti. Servono almeno due
  distanze diverse, una ≤ 400 m e una ≥ 400 m. Se la regressione dà CS ≤ 0 o D′ < 0, si ripiega su
  Ginn con i migliori 200 e 400; altrimenti nessuna stima.
- **Controlli:** il passo soglia deve stare tra 1:00 e 3:30/100 m e non essere più veloce del
  miglior 200.
- **Affidabilità:** «alta» con almeno 3 punti che coprono un rapporto di distanza ≥ 3; «media» con
  2 punti; altrimenti nessuna stima. Le stime da allenamento sono di solito un po' più lente del
  vero, perché raramente si nuota a tutta: va detto nel testo.
- **Test facoltativo:** l'utente può inserire i tempi di un test 400 e 200 a tutta (con la data).
  Un test degli ultimi 90 giorni vale più della stima. CSS = 200 / (T400 − T200) m/s. Va
  salvato in `swimmer_profiles.preferences.cssTest = { t200Seconds, t400Seconds, date }`, senza
  migrazione.
- **Mostrato:** passo m:ss/100 m, fonte (stima o test), affidabilità. Grafico: valore a fine mese
  sugli ultimi 6 mesi (stima su 90 giorni a ritroso da ogni fine mese), con i punti usati.

### 4.2 Forma e fatica (carico, CTL, ATL, TSB)
- **Fonte:** carico del nuoto di TrainingPeaks (sTSS = IF³ × ore × 100, con IF = velocità
  normalizzata / velocità soglia; il cubo segue la resistenza dell'acqua); modello di Banister nella
  forma di TrainingPeaks (forma a 42 giorni, fatica a 7 giorni, equilibrio = forma − fatica).
- **Per sessione:** velocità = distanza totale / tempo in movimento (somma dei giri attivi; senza
  giri, distanza / durata). Si usa il CSS valido in quella data (la stima mensile più vicina). IF
  ha un tetto di 1,3. Acque libere: stesso calcolo sul passo della sessione.
- **Giornaliero:** CTL_t = CTL_{t−1} + (TSS_t − CTL_{t−1}) / 42; ATL con 7. Si calcola su 180
  giorni per stabilizzare la curva e si mostrano gli ultimi 90. L'equilibrio (TSB) di oggi è
  CTL − ATL a fine di ieri.
- **Letture (convenzioni TrainingPeaks, dette come tali):**

  | TSB | Lettura |
  |---|---|
  | > +15 | molto riposato; se dura a lungo, la forma cala |
  | da +5 a +15 | fresco |
  | da −10 a +5 | neutro |
  | da −30 a −10 | in costruzione |
  | < −30 | carico alto, valuta un recupero |

  Aumento di CTL > 8 punti/settimana: crescita molto rapida.
- **Senza CSS:** nessun carico. Il riquadro spiega che serve il passo soglia.
- **Mostrato:** equilibrio di oggi e lettura. Grafico: forma e fatica (linee) ed equilibrio (barre)
  sugli ultimi 90 giorni.

### 4.3 Intensità (zone di passo dal CSS)
- **Fonte:** zone di passo relative al CSS (Swim Smooth, TrainingPeaks); distribuzione
  dell'intensità polarizzata o piramidale (Seiler, 2010; Stöggl e Sperlich, 2014). I confini sono
  una convenzione, espressa in % della velocità soglia:

  | Zona | Velocità rispetto alla soglia |
  |---|---|
  | Z1 Facile | < 85% |
  | Z2 Aerobico | 85–92% |
  | Z3 Medio | 92–97% |
  | Z4 Soglia | 97–103% |
  | Z5 Sopra soglia | > 103% |

- **Calcolo:** ogni giro attivo va in una zona secondo la sua velocità; si somma la distanza.
- **Mostrato:** quota facile (Z1–Z2), medio (Z3) e intenso (Z4–Z5) degli ultimi 28 giorni.
  Lettura: se Z3 supera ~35% del volume, «molto lavoro in zona media»; è un'indicazione basata
  sugli studi, non una regola. Grafico: barre settimanali impilate per zona (8 settimane), con i
  colori `--zone-1..5`.

### 4.4 Efficienza della bracciata (Stroke Index)
- **Fonte:** Stroke Index = velocità × distanza per ciclo (Costill et al., 1985).
- **Calcolo:** per sessione, media pesata sulla distanza dei giri attivi a stile libero con
  bracciate. DPS = distanza / bracciate; velocità = distanza / tempo in movimento. Frequenza =
  bracciate / minuti in movimento.
- **Confronto:** con la mediana delle sessioni dei 90 giorni precedenti, nella stessa lunghezza di
  vasca (la spinta dal muro cambia la DPS tra 25 e 50 m).
- **Mostrato:** SI dell'ultima sessione e media 28 giorni, con la differenza % dalla tua base.
  Grafico: SI per sessione con la linea di base; sotto, SWOLF medio e frequenza di bracciata per
  sessione (stessa vasca).

### 4.5 Regolarità nelle ripetute
- **Fonte:** variabilità del passo (coefficiente di variazione) e calo nel finale, misure usate
  negli studi sul pacing e dagli allenatori.
- **Serie:** almeno 3 giri attivi consecutivi (ignorando i recuperi tra l'uno e l'altro) con la
  stessa distanza ≥ 50 m e lo stesso stile. La serie si chiude quando cambiano distanza o stile.
- **Per serie:**
  - CV = deviazione standard / media dei tempi;
  - calo = (media dell'ultimo terzo − media del primo terzo) / media del primo terzo × 100.
- **Per sessione:** media pesata sulla distanza delle serie.
- **Letture:** sono convenzioni nostre e il testo lo dice.
  - CV < 2%: molto regolare; 2–4%: regolare; > 4%: irregolare.
  - Calo > 5%: «cali nel finale».
- **Mostrato:** CV e calo mediani degli ultimi 28 giorni. Grafico: i tempi della serie più recente
  (barre) e il CV per sessione nel tempo.

### 4.6 Volume e costanza
- **Calcolo:** km e nuotate per settimana (lunedì–domenica, fuso Europe/Rome) nelle ultime 12
  settimane; medie delle ultime 4 settimane e differenza % dalle 4 precedenti.
- **Serie:** settimane consecutive con almeno 2 nuotate. La settimana in corso non interrompe la
  serie finché non è finita. Sostituisce la serie lunedì/mercoledì/venerdì ovunque: Statistiche,
  Profilo (`client/src/lib/profile-stats.ts`), Sfide.
- **Mostrato:** km/settimana medi, nuotate/settimana medie, serie in settimane. Grafico: barre
  settimanali dei km con il numero di nuotate.

## 5. Cosa sparisce
`server/advanced_metrics.ts`, i campi relativi di `getAdvancedMetrics`, le relative voci di
`client/src/data/metricsDefinitions.ts`, la previsione «50 km», la serie lunedì/mercoledì/venerdì.
La procedura `statistics.getAdvanced` viene tolta. I client vecchi (build Android di prova) la
usano solo in sezioni che spariscono se la richiesta fallisce.

## 6. Architettura
- **Modulo server** `server/swim_metrics/`:
  - funzioni pure, una per metrica (`css.ts`, `load.ts`, `zones.ts`, `efficiency.ts`,
    `pacing.ts`, `volume.ts`);
  - `getSwimMetrics(userId)` legge 180 giorni di nuotate e i loro giri (due query) e calcola tutto.
- **Cache Redis:** `swim-metrics:v1:{userId}`, 1 ora. Si invalida a ogni nuova nuotata, modifica,
  cancellazione o sincronizzazione (agganciarsi a dove oggi si invalidano statistiche/classifiche)
  e al salvataggio di un test CSS.
- **Definizioni condivise** `shared/swimMetrics.ts`:
  - i tipi del risultato;
  - per ogni metrica: nome, cosa misura, formula, fonte, come si legge, soglie.
  - Le usano sia l'interfaccia sia il coach.
- **tRPC:**
  - `statistics.getMetrics` (solo per sé);
  - `statistics.setCssTest` e `statistics.clearCssTest`, con validazione: tempi plausibili e
    T400/T200 tra 1,9 e 2,4;
  - `statistics.getInsights`, i suggerimenti AI della pagina Coach, generati dalle nuove metriche.
    Prende il posto di `advanced.insights`.
- **Coach** (`server/ai_coach_chat.ts`, `server/ai_insights.ts`):
  - riceve le sei metriche con valore, base personale, tendenza e affidabilità, più le ultime 5
    sessioni con IF, carico e distribuzione per zona;
  - riceve un glossario generato dalle definizioni condivise;
  - istruzioni: usare solo queste metriche, citarle quando servono, dire quando i dati sono pochi o
    l'affidabilità è bassa, non inventare altri indici.

## 7. Interfaccia (Allena → Statistiche)
- La sezione «Analisi avanzate» diventa «Metriche»: sei riquadri richiudibili, tutti chiusi
  all'avvio (Accordion `multiple`).
- **Intestazione:** nome, valore principale con unità e lettura breve (es. «Passo soglia · 1:48 ·
  stima, affidabilità media»).
- **Riquadro aperto:**
  - il grafico, montato solo quando il riquadro è aperto;
  - «Come si legge» in una riga;
  - la base dei dati;
  - «Come si calcola», che apre formula e fonte;
  - per il passo soglia, «Inserisci un test».
- **Dati insufficienti:** «—» nell'intestazione e, aperto, cosa serve (es. «Servono almeno due
  nuotate continue a stile libero, una di almeno 400 m»).
- **Grafici:** stile Corsia (token `--chart-*` e `--zone-*`, niente gradienti), leggibili in
  entrambi i temi, da 360 px al desktop, numeri con `lib/format.ts`, etichette in italiano, una
  frase di sintesi accessibile per grafico.

## 8. Test
- **Funzioni pure, con esempi calcolati a mano:**
  - Ginn: T200 180 s e T400 380 s danno 1:40/100;
  - regressione con 3 punti; ripiego e nessuna stima;
  - sTSS: IF 1 per 1 ora = 100; ricorsione CTL/ATL;
  - confini delle zone; SI;
  - riconoscimento delle serie, CV e calo;
  - settimane e serie a cavallo di mezzanotte e del cambio d'ora.
- **Integrazione:** `getSwimMetrics` con il db finto; procedure (solo per sé, validazione del test
  CSS).
- **Coach:** il contesto contiene le nuove metriche e non contiene più i vecchi nomi.
- **Interfaccia:** riquadri chiusi all'avvio; aprendo si vede la sintesi del grafico; «—» e testo
  quando mancano i dati; inserimento del test.
