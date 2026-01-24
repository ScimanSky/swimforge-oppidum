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
    const model = client.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

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

Regole:
1. Ogni insight deve iniziare con un emoji appropriato
2. Usa tono amichevole, motivazionale e positivo
3. Fornisci suggerimenti concreti e actionable
4. Confronta con periodi precedenti quando possibile
5. Celebra i successi e incoraggia nei momenti difficili
6. Sii specifico con i numeri
7. Ogni insight deve essere 1-2 frasi max
8. Non ripetere informazioni già evidenti

Genera 3-4 insights unici e personalizzati:`;

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
