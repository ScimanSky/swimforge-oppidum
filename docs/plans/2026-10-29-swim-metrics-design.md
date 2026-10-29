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
  sulle distanze 200, 300, 400, 500, 600, 800, 1000, 1500 (±3%; in vasca da 25 yd la distanza è
  in yard e il calcolo usa i metri veri), il miglior passo per distanza, tra 2 e 30 minuti.
  - Un tratto più lento per 100 m di uno più lungo non era a tutta: si scarta (ed è mostrato).
  - Minimi quadrati distanza = CS × tempo + D′; con D′ < 0 la retta passa per l'origine.
  - Serve un tratto lungo almeno il doppio del più corto; altrimenti nessuna stima.
- **Controlli:** il passo soglia deve stare tra 1:00 e 3:30/100 m e non essere più veloce del
  tratto più corto usato.
- **Affidabilità:** «alta» con almeno 3 punti che coprono un rapporto di distanza ≥ 3, D′ tra 0 e
  50 m e R² ≥ 0,98; «media» negli altri casi. Le stime da allenamento sono di solito un po' più
  lente del vero, perché raramente si nuota a tutta: va detto nel testo.
- **Test facoltativo:** l'utente può inserire i tempi di un test 400 e 200 a tutta (con la data).
  CSS = 200 / (T400 − T200) m/s. Il 200 almeno 1:40, T400/T200 tra 2,02 e 2,4 (il passo soglia
  non è mai più veloce del 400), passo tra 1:00 e 3:30/100 m; ogni errore sta sul suo campo.
  Vale dalla sua data per 90 giorni (quel giorno compreso), solo in avanti; le nuotate prima del
  test usano la stima del loro mese, e un test scaduto non si usa mai. Salvato in
  `swimmer_profiles.preferences.cssTest = { t200Seconds, t400Seconds, date }` con un merge SQL.
- **Mostrato:** passo m:ss/100 m, fonte (stima o test), affidabilità. Grafico: valore a fine mese
  sugli ultimi 6 mesi (stima su 90 giorni a ritroso da ogni fine mese), con i punti usati.

### 4.2 Forma e fatica (carico, CTL, ATL, TSB)
- **Fonte:** carico del nuoto di TrainingPeaks (sTSS = IF³ × ore × 100, con IF = velocità
  normalizzata / velocità soglia; il cubo segue la resistenza dell'acqua); modello di Banister nella
  forma di TrainingPeaks (forma a 42 giorni, fatica a 7 giorni, equilibrio = forma − fatica).
- **Per sessione con i giri:** sTSS = Σ sui giri attivi (vᵢ/CSS)³ × tᵢ/3600 × 100 (tempo in
  movimento, come le zone; tetto 1,3 per giro); IF = (Σ (vᵢ/CSS)³·tᵢ / Σ tᵢ)^(1/3). I giri non a
  stile libero hanno IF fisso 0,80 (convenzione nostra); in acque libere tutti i giri sono stile
  libero. TrainingPeaks usa la durata totale con le pause, per questo nelle sedute a intervalli il
  nostro carico è un po' più alto.
- **Senza giri:** IF = (distanza / durata totale) / CSS, come TrainingPeaks; carico «stimato».
- Si usa il CSS valido in quella data (test valido o stima del mese). Carico e zone ci sono solo
  se c'è il passo soglia di oggi, così concordano sempre con il CSS mostrato.
- **Giornaliero:** CTL_t = CTL_{t−1} + (TSS_t − CTL_{t−1}) / 42; ATL con 7. Si calcola su 180
  giorni per stabilizzare la curva e si mostrano gli ultimi 90. L'equilibrio (TSB) di oggi è
  CTL − ATL a fine di ieri.
- **Letture (convenzioni TrainingPeaks, dette come tali):**

  | TSB | Lettura |
  |---|---|
  | > +25 | molto riposato (rischio di perdere forma se dura) |
  | da +5 (escluso) a +25 | fresco |
  | da −10 a +5 | neutro |
  | da −30 a −10 (escluso) | in costruzione |
  | < −30 | carico alto |

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

- **Calcolo:** ogni giro attivo a stile libero va in una zona secondo la sua velocità; si somma la
  distanza. Gli altri stili, la tecnica e le gambe sono «non classificati» (`unclassifiedMeters`);
  la copertura è la quota dei metri delle 4 settimane che sta nelle zone. Al coach le zone
  arrivano come passi m:ss/100 m (passo = passo soglia / rapporto di velocità).
- **Mostrato:** quota facile (Z1–Z2), medio (Z3) e intenso (Z4–Z5) degli ultimi 28 giorni.
  Lettura: se Z3 supera ~35% del volume, «molto lavoro in zona media»; è un'indicazione basata
  sugli studi, non una regola. Grafico: barre settimanali impilate per zona (8 settimane), con i
  colori `--zone-1..5`.

### 4.4 Efficienza della bracciata (Stroke Index)
- **Fonte:** Stroke Index = velocità × distanza per ciclo (Costill et al., 1985).
- **Calcolo:** per sessione, media pesata sulla distanza dei giri attivi a stile libero con
  bracciate plausibili (0,9–3,2 m per ciclo, almeno 15 cicli al minuto). DPS = distanza /
  bracciate; velocità = distanza / tempo in movimento. Frequenza = bracciate / minuti in movimento.
- **Confronto:** mediana delle ultime 4 settimane contro la mediana delle sessioni dei 90 giorni
  precedenti, nella stessa lunghezza di vasca (la spinta dal muro cambia la DPS tra 25 e 50 m),
  con almeno 3 nuotate di base; si mostrano i numeri di nuotate e, accanto, distanza per ciclo e
  passo mediani (più strada per bracciata o solo più veloce).
- **Mostrato:** SI dell'ultima sessione e media 28 giorni, con la differenza % dalla tua base.
  Grafico: SI per sessione con la linea di base; sotto, SWOLF medio e frequenza di bracciata per
  sessione (stessa vasca).

### 4.5 Regolarità e tenuta nelle ripetute
- **Fonte:** variabilità del passo (coefficiente di variazione) e calo nel finale, misure usate
  negli studi sul pacing e dagli allenatori.
- **Serie:** almeno 3 giri attivi consecutivi con la stessa distanza ≥ 50 m e lo stesso stile. La
  serie si chiude quando cambiano distanza o stile, o con un recupero più lungo di max(60 s, 2 ×
  la mediana dei recuperi già visti nella serie); un giro più lento non la chiude mai.
- **Per serie:**
  - CV = deviazione standard campionaria (n − 1) / media dei tempi;
  - calo = (media dell'ultimo terzo − media del primo terzo) / media del primo terzo × 100.
  - tenuta della bracciata (con le bracciate di ogni ripetuta; Craig e Pendergast, 1979; Keskinen
    e Komi, 1993): calo della DPS = (media del primo terzo − media dell'ultimo terzo) / primo terzo
    × 100, aumento della frequenza allo stesso modo.
- **Per sessione:** media pesata sulla distanza delle serie.
- **Letture:** sono convenzioni nostre e il testo lo dice. DPS che cala oltre il 5%: «la bracciata
  si accorcia nel finale».
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
- **Letture:** cinque query in parallelo (nuotate e giri di 180 giorni, profilo, giri vicini alle
  distanze CSS di 300 giorni per avere intera la finestra di 90 giorni di ogni mese, nuotate per
  settimana di Roma per la serie).
- **Cache Redis:** `swim-metrics:v2:{userId}:{giorno di Roma}` (il carico di oggi cambia a
  mezzanotte), 1 ora. Si invalida a ogni nuova nuotata, modifica, cancellazione o sincronizzazione
  che cambia le nuotate e al salvataggio o alla rimozione di un test CSS; negli stessi casi si
  cancellano i suggerimenti AI della pagina Coach in cache.
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
