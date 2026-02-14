
import { getDb } from "../server/db";
import { aiCoachWorkouts } from "../drizzle/schema";
import { eq } from "drizzle-orm";

async function main() {
    const db = await getDb();
    if (!db) {
        console.error("Failed to connect to DB");
        process.exit(1);
    }

    console.log("Checking ai_coach_workouts for user 4...");

    try {
        const workouts = await db
            .select()
            .from(aiCoachWorkouts)
            .where(eq(aiCoachWorkouts.userId, 4));

        console.log(`Found ${workouts.length} workouts for user 4.`);

        for (const w of workouts) {
            console.log(`- Type: ${w.workoutType}, GeneratedAt: ${w.generatedAt}, ExpiresAt: ${w.expiresAt}`);
            console.log(`  Data length: ${w.workoutData.length}`);
        }

        // Check table structure (by attempting a dummy insert or just assuming if select worked)
        console.log("Table ai_coach_workouts is accessible.");

    } catch (error) {
        console.error("Error querying ai_coach_workouts:", error);
    }

    process.exit(0);
}

main();
