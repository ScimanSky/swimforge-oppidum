
import dotenv from "dotenv";
import path from "path";

// Load env before imports that use it
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { getDb } from "../server/db";
import { aiCoachWorkouts } from "../drizzle/schema";
import { eq } from "drizzle-orm";

async function main() {
    console.log("Loading environment...");
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL is missing from .env");
        process.exit(1);
    }

    const db = await getDb();
    if (!db) {
        console.error("Failed to connect to DB");
        process.exit(1);
    }

    console.log("Checking ai_coach_workouts table...");

    try {
        const workouts = await db
            .select()
            .from(aiCoachWorkouts)
            .limit(5);

        console.log(`Table exists. Found ${workouts.length} total workouts.`);

        // Check for user 4 specifically
        const userWorkouts = await db
            .select()
            .from(aiCoachWorkouts)
            .where(eq(aiCoachWorkouts.userId, 4));

        console.log(`User 4 has ${userWorkouts.length} workouts.`);
        for (const w of userWorkouts) {
            console.log(`- Type: ${w.workoutType}, GeneratedAt: ${w.generatedAt}`);
        }

    } catch (error) {
        console.error("Error querying ai_coach_workouts:", error);
        if (String(error).includes("relation") && String(error).includes("does not exist")) {
            console.error("CRITICAL: The table 'ai_coach_workouts' does not exist in the database!");
            console.error("Please run the migrations.");
        }
    }

    process.exit(0);
}

main();
