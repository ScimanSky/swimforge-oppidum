export const metricsDefinitions = {
  sei: {
    title: "Swimming Efficiency Index (SEI)",
    description:
      "L'indice di efficienza del nuoto combina SWOLF, distanza per bracciata e pace in un unico punteggio che misura quanto sei efficiente in acqua. Un punteggio alto indica che nuoti velocemente usando meno energia.",
    formula: `SEI = (swolf_score × 0.4) + (stroke_efficiency × 0.35) + (pace_score × 0.25)

Dove:
• swolf_score = 100 - (SWOLF attuale - 35) × 2
• stroke_efficiency = (distanza_bracciata / 2.5m) × 100
• pace_score = (90s / pace_attuale) × 100`,
    interpretation: {
      excellent: "Tecnica molto efficiente, continua così!",
      good: "Tecnica solida con margini di miglioramento",
      fair: "Lavora su tecnica e ritmo per migliorare",
      poor: "Focus su efficienza della bracciata",
    },
    howToImprove: [
      "Concentrati sulla fase di scivolamento dopo ogni bracciata",
      "Fai esercizi di tecnica (catch-up, fist drill) per 10-15 minuti a sessione",
      "Riduci il numero di bracciate per vasca mantenendo la velocità",
      "Lavora sulla rotazione del corpo per aumentare la distanza per bracciata",
      "Usa il pull buoy per isolare il movimento delle braccia",
    ],
  },
  tci: {
    title: "Technical Consistency Index (TCI)",
    description:
      "L'indice di consistenza tecnica misura quanto sei regolare tra le vasche e tra le sessioni. Un punteggio alto indica che mantieni lo stesso ritmo e la stessa tecnica per tutta la durata dell'allenamento.",
    formula: `TCI = 100 - (coefficiente_variazione × 100)

Dove:
• coefficiente_variazione = deviazione_standard / media
• Calcolato su pace, SWOLF e numero bracciate`,
    interpretation: {
      excellent: "Ritmo molto costante, ottima gestione",
      good: "Buona consistenza, continua così",
      fair: "Variazioni moderate, lavora sulla regolarità",
      poor: "Ritmo irregolare, focus sulla gestione",
    },
    howToImprove: [
      "Usa un tempo trainer o metronomo per mantenere il ritmo",
      "Fai serie con intervalli di recupero fissi (es. 10x100 @ 1:30)",
      "Concentrati sul conteggio delle bracciate per vasca",
      "Evita di partire troppo veloce, mantieni un ritmo sostenibile",
      "Pratica la respirazione bilaterale per bilanciare la tecnica",
    ],
  },
  ser: {
    title: "Stroke Efficiency Rating (SER)",
    description:
      "Il rating di efficienza della bracciata misura quanto 'scivoli' in acqua. Combina la distanza percorsa per ogni bracciata con il numero totale di bracciate. Più alto è il punteggio, più efficiente è la tua bracciata.",
    formula: `SER = (stroke_distance_ratio × 0.6) + (stroke_count_ratio × 0.4)

Dove:
• stroke_distance_ratio = (distanza_attuale / 2.5m) × 100
• stroke_count_ratio = (10 bracciate / bracciate_attuali) × 100
  (per vasca da 25m)`,
    interpretation: {
      excellent: "Scivolamento ottimale, tecnica eccellente",
      good: "Buona efficienza bracciata",
      fair: "Aumenta la distanza per bracciata",
      poor: "Troppe bracciate, poco scivolamento",
    },
    howToImprove: [
      "Fai drill di scivolamento (streamline kicks)",
      "Pratica il 'catch-up drill' per allungare la bracciata",
      "Lavora sulla presa dell'acqua (high elbow catch)",
      "Riduci consapevolmente di 1-2 bracciate per vasca",
      "Usa le pinne per sentire meglio lo scivolamento",
    ],
  },
  acs: {
    title: "Aerobic Capacity Score (ACS)",
    description:
      "Il punteggio di capacità aerobica misura l'efficienza del tuo sistema cardiovascolare durante il nuoto. Si basa sulla distribuzione del tempo nelle diverse zone di frequenza cardiaca e sull'effetto allenante.",
    formula: `ACS = zone_distribution_score × training_effect_multiplier

Dove:
• zone_distribution = (Z2% × 0.3) + (Z3% × 0.5) + (Z4% × 0.2)
  (privilegia Z3 per sviluppo aerobico)
• training_effect_multiplier = training_effect / 5.0`,
    interpretation: {
      excellent: "Ottima capacità aerobica",
      good: "Buona base aerobica, continua a costruire",
      fair: "Capacità aerobica discreta, continua l'allenamento",
      poor: "Lavora su volume in Z2-Z3",
    },
    howToImprove: [
      "Aumenta il volume settimanale gradualmente (+10% a settimana)",
      "Fai almeno 1 sessione lunga in Z2 (60-70% FC max) a settimana",
      "Aggiungi intervalli in Z3 (70-80% FC max): 8x200m @ Z3",
      "Mantieni la consistenza: 3-4 sessioni/settimana",
      "Monitora la frequenza cardiaca a riposo (dovrebbe diminuire)",
    ],
  },
  rrs: {
    title: "Recovery Readiness Score (RRS)",
    description:
      "Il punteggio di prontezza al recupero stima quanto sei pronto per il prossimo allenamento intenso. Si basa sulla frequenza cardiaca a riposo e sul tempo trascorso dall'ultimo allenamento.",
    formula: `RRS = hr_recovery_score × time_factor

Dove:
• hr_recovery_score = 100 - ((FC_riposo - FC_baseline) / FC_baseline × 100)
• time_factor = ore_trascorse / ore_recupero_raccomandate
  (max 1.0)`,
    interpretation: {
      excellent: "Pronto per allenamento intenso",
      good: "Allenamento moderato ok",
      fair: "Allenamento leggero consigliato",
      poor: "Riposo o recupero attivo necessario",
    },
    howToImprove: [
      "Dormi almeno 7-8 ore per notte",
      "Idratati adeguatamente (2-3 litri/giorno)",
      "Fai stretching e foam rolling dopo gli allenamenti",
      "Rispetta i giorni di recupero (almeno 1-2/settimana)",
      "Considera sessioni di recupero attivo (nuoto facile 20-30min)",
    ],
  },
  poi: {
    title: "Progressive Overload Index (POI)",
    description:
      "L'indice di sovraccarico progressivo misura se stai progredendo al ritmo giusto. Un valore tra +10% e +20% indica una progressione ottimale. Valori troppo alti indicano rischio di sovrallenamento, valori negativi indicano un calo.",
    formula: `POI = (distance_trend × 0.3) + (intensity_trend × 0.4) + (frequency_trend × 0.3)

Dove ogni trend è:
• trend = ((periodo_attuale - periodo_precedente) / periodo_precedente) × 100`,
    interpretation: {
      excellent: "Progressione ottimale (+10% a +20%)",
      good: "Progressione graduale (+5% a +9%)",
      fair: "Stabile o lieve calo (0% a +4%)",
      poor: "Calo significativo o sovrallenamento",
    },
    howToImprove: [
      "Aumenta distanza/intensità gradualmente (+5-10% a settimana)",
      "Varia gli allenamenti: facile, moderato, intenso",
      "Se POI > +20%: riduci il carico per evitare infortuni",
      "Se POI < 0%: verifica recupero, motivazione, stress extra-sportivo",
      "Pianifica cicli di carico/scarico (3 settimane carico, 1 scarico)",
    ],
  },
  performanceIndex: {
    title: "Performance Index",
    description:
      "L'indice di performance generale combina distanza, frequenza e pace in un punteggio complessivo che riflette il tuo livello di forma fisica attuale nel nuoto.",
    formula: `Performance Index = distanza_score + frequenza_score + pace_score

Dove:
• distanza_score = min((km_totali / settimane) × 10, 40)
• frequenza_score = min((sessioni / settimane) × 10, 30)
• pace_score = max(30 - (pace - 120) / 10, 0)`,
    interpretation: {
      excellent: "Forma fisica eccellente",
      good: "Buona forma fisica",
      fair: "Forma fisica discreta",
      poor: "Continua ad allenarti per migliorare",
    },
    howToImprove: [
      "Aumenta la frequenza degli allenamenti (target: 3-4/settimana)",
      "Incrementa gradualmente la distanza totale settimanale",
      "Lavora sulla velocità con intervalli brevi ad alta intensità",
      "Mantieni la consistenza nel tempo",
      "Varia gli stili di nuoto per sviluppo completo",
    ],
  },
  consistencyScore: {
    title: "Consistency Score",
    description:
      "Il punteggio di consistenza misura quanto sei regolare negli allenamenti. Si basa sulla frequenza settimanale e sullo streak (giorni consecutivi di allenamento).",
    formula: `Consistency = regolarità_score + streak_score - gap_penalty

Dove:
• regolarità_score = (giorni_con_attività / giorni_totali) × 50
• streak_score = min(streak_attuale × 5, 30)
• gap_penalty = 20 se streak = 0, altrimenti 0`,
    interpretation: {
      excellent: "Molto costante negli allenamenti",
      good: "Buona regolarità",
      fair: "Regolarità moderata, può migliorare",
      poor: "Poca regolarità, serve più costanza",
    },
    howToImprove: [
      "Pianifica gli allenamenti come appuntamenti fissi",
      "Inizia con obiettivi realistici (es. 2 volte/settimana)",
      "Trova un compagno di allenamento per motivazione",
      "Prepara la borsa la sera prima",
      "Celebra i piccoli traguardi (streak di 7, 14, 30 giorni)",
    ],
  },
};
