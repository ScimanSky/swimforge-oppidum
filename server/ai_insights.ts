import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini AI
let genAI: GoogleGenerativeAI | null = null;

function getGeminiClient() {
  if (!genAI && process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

export interface UserStatsData {
  level: number;
  totalXp: number;
  currentStreak: number;
  recordStreak: number;
  avgPaceSeconds: number;
  totalDistanceMeters: number;
  sessions: number;
  hrZones?: {
    zone1: number;
    zone2: number;
    zone3: number;
    zone4: number;
    zone5: number;
  };
  trend: "up" | "down" | "stable";
  trendPercentage: number;
  performanceIndex: number;
  consistencyScore: number;
  periodDays: number;
  swolfAvg?: number;
  caloriesTotal?: number;
}

export async function generateAIInsights(
  userData: UserStatsData
): Promise<string[]> {
  const client = getGeminiClient();
  
  // Fallback to algorithmic insights if no API key
  if (!client) {
    return generateAlgorithmicInsights(userData);
  }

  try {
    const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `Sei un coach di nuoto esperto e motivazionale. Analizza questi dati di un nuotatore e genera 3-4 insights personalizzati, motivazionali e actionable in italiano.

Dati nuotatore (ultimi ${userData.periodDays} giorni):
- Livello: ${userData.level}
- XP Totali: ${userData.totalXp}
- Streak attuale: ${userData.currentStreak} giorni (record: ${userData.recordStreak})
- Distanza totale: ${(userData.totalDistanceMeters / 1000).toFixed(1)} km
- Sessioni: ${userData.sessions}
- Pace medio: ${formatPace(userData.avgPaceSeconds)}/100m
- Trend: ${userData.trend === "up" ? "crescita" : userData.trend === "down" ? "calo" : "stabile"} ${userData.trendPercentage}%
- Performance Index: ${userData.performanceIndex}/100
- Consistency Score: ${userData.consistencyScore}/100
${userData.hrZones ? `- Zone HR: Z1=${userData.hrZones.zone1}%, Z2=${userData.hrZones.zone2}%, Z3=${userData.hrZones.zone3}%, Z4=${userData.hrZones.zone4}%, Z5=${userData.hrZones.zone5}%` : ""}
${userData.swolfAvg ? `- SWOLF medio: ${userData.swolfAvg}` : ""}
${userData.caloriesTotal ? `- Calorie totali: ${userData.caloriesTotal}` : ""}

REGOLE FONDAMENTALI:

1. ❌ NON RIPETERE I DATI VISIBILI
   - L'utente vede già distanza, sessioni, pace, streak
   - NON dire "Hai nuotato X km in Y sessioni"
   - NON dire "Il tuo pace medio è X:XX/100m"
   - NON dire "Hai un Performance Index di X/100"

2. ✅ INTERPRETA E COLLEGA I DATI
   - Calcola medie (es. km per sessione, frequenza settimanale)
   - Confronta con standard (principiante/intermedio/avanzato)
   - Identifica pattern nascosti (es. "nuoti più veloce ma meno costante")
   - Trova correlazioni (es. "le tue zone HR indicano che potresti spingere di più")

3. ✅ DAI CONSIGLI SPECIFICI E ACTIONABLE
   - Suggerisci modifiche concrete (es. "aggiungi 500m di tecnica ogni 3 sessioni")
   - Proponi obiettivi raggiungibili (es. "punta a 3 sessioni/settimana per 2 settimane")
   - Indica cosa fare DOMANI (es. "nella prossima sessione prova 4x100m in Z3")

4. ✅ USA CONTESTO E PSICOLOGIA
   - Se streak = 0 ma record > 0: motivazione per ripartire
   - Se Performance Index alto ma Consistency basso: focus su regolarità
   - Se trend negativo: incoraggiamento senza giudizio
   - Se trend positivo: celebrazione + sfida successiva

5. 📝 FORMATO
   - Ogni insight inizia con emoji appropriato
   - 1-2 frasi max per insight
   - Tono amichevole e motivazionale
   - Usa "tu" e linguaggio diretto

ESEMPI DI INSIGHTS BUONI:
✅ "Con una media di 2.7 km a sessione, sei già oltre la soglia 'principiante'. Prova ad aggiungere 500m di tecnica ogni 3 sessioni per passare al livello successivo più velocemente."
✅ "Il tuo Performance Index alto ma Consistency basso suggerisce che quando nuoti, nuoti bene! Il prossimo step? Punta a 2-3 sessioni/settimana per 2 settimane consecutive."
✅ "Le tue zone HR mostrano che passi il 60% del tempo in Z2 (aerobica). Ottimo per la base! Ora prova a inserire 1 sessione/settimana con 4x100m in Z3-Z4 per migliorare la velocità."

ESEMPI DI INSIGHTS CATTIVI (DA EVITARE):
❌ "Hai nuotato 16.3 km in 6 sessioni" (RIPETE I DATI)
❌ "Il tuo pace medio è 1:40/100m" (RIPETE I DATI)
❌ "Continua così!" (TROPPO GENERICO)

Genera 3-4 insights seguendo RIGOROSAMENTE queste regole:`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Parse insights (split by newlines, filter empty)
    const insights = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line.match(/^[🔥⚡💪🎯📈🏊‍♂️🌟🚀💯🏆❤️📊🎉]/));

    // Return first 4 insights or fallback
    if (insights.length > 0) {
      return insights.slice(0, 4);
    }

    // Fallback if parsing fails
    return generateAlgorithmicInsights(userData);
  } catch (error) {
    console.error("Error generating AI insights:", error);
    return generateAlgorithmicInsights(userData);
  }
}

// Fallback algorithmic insights
function generateAlgorithmicInsights(userData: UserStatsData): string[] {
  const insights: string[] = [];

  // Streak insight
  if (userData.currentStreak > 0) {
    if (userData.currentStreak >= 7) {
      insights.push(
        `🔥 Streak di ${userData.currentStreak} giorni! Sei nella top 15% degli utenti per costanza. Continua così!`
      );
    } else if (userData.currentStreak >= 3) {
      insights.push(
        `🔥 Streak di ${userData.currentStreak} giorni! Mantieni il ritmo per raggiungere una settimana completa!`
      );
    }
  } else if (userData.recordStreak > 0) {
    insights.push(
      `💪 Hai perso lo streak. Il tuo record è ${userData.recordStreak} giorni - riparti oggi per batterlo!`
    );
  }

  // Trend insight
  if (userData.trend === "up" && userData.trendPercentage > 10) {
    insights.push(
      `📈 Performance in crescita +${userData.trendPercentage}%! Stai migliorando rapidamente, continua così!`
    );
  } else if (userData.trend === "down" && userData.trendPercentage > 10) {
    insights.push(
      `📊 Calo del ${userData.trendPercentage}% rispetto al periodo precedente. Riparti con una sessione oggi!`
    );
  }

  // Distance insight
  const kmPerWeek = (userData.totalDistanceMeters / 1000 / userData.periodDays) * 7;
  if (kmPerWeek > 10) {
    insights.push(
      `🏊‍♂️ Hai nuotato ${(userData.totalDistanceMeters / 1000).toFixed(1)}km in ${userData.periodDays} giorni, ottimo ritmo!`
    );
  } else if (kmPerWeek > 5) {
    insights.push(
      `💪 ${(userData.totalDistanceMeters / 1000).toFixed(1)}km in ${userData.periodDays} giorni. Aggiungi una sessione per accelerare i progressi!`
    );
  }

  // Pace insight
  if (userData.avgPaceSeconds < 120) {
    insights.push(
      `⚡ Pace medio ${formatPace(userData.avgPaceSeconds)}/100m, eccellente velocità! Sei un nuotatore esperto!`
    );
  } else if (userData.avgPaceSeconds < 150) {
    insights.push(
      `⚡ Pace medio ${formatPace(userData.avgPaceSeconds)}/100m, buona velocità. Punta a scendere sotto i 2:00!`
    );
  }

  // HR Zone insight
  if (userData.hrZones) {
    if (userData.hrZones.zone2 > 40) {
      insights.push(
        `❤️ La tua zona HR preferita è Z2 (aerobica, ${userData.hrZones.zone2}%). Perfetta per costruire resistenza!`
      );
    } else if (userData.hrZones.zone3 > 30) {
      insights.push(
        `❤️ Nuoti spesso in Z3 (soglia, ${userData.hrZones.zone3}%). Ottimo per migliorare la velocità!`
      );
    }
  }

  // Return at least 3 insights
  if (insights.length < 3) {
    insights.push(
      `🎯 Consistency Score: ${userData.consistencyScore}/100. ${
        userData.consistencyScore > 70 ? "Ottima regolarità!" : "Cerca di essere più costante!"
      }`
    );
  }

  return insights.slice(0, 4);
}

function formatPace(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
