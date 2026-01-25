import { Router, Request, Response } from "express";
import { db } from "../drizzle/db";
import { swimmingActivities } from "../drizzle/schema";
import { eq, isNull } from "drizzle-orm";
import { authenticateToken } from "./auth";

const router = Router();

const GARMIN_SERVICE_URL = process.env.GARMIN_SERVICE_URL || "http://localhost:8000";

/**
 * Migrate HR zones data for existing activities
 * This endpoint fetches HR zones data from Garmin for activities that don't have it yet
 */
router.post("/api/migrate-hr-zones", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    console.log(`[Migrate HR Zones] Starting migration for user ${userId}`);

    // Get all activities without HR zones data
    const activitiesWithoutHR = await db
      .select()
      .from(swimmingActivities)
      .where(eq(swimmingActivities.userId, userId))
      .where(isNull(swimmingActivities.hrZone1Seconds));

    if (activitiesWithoutHR.length === 0) {
      return res.json({
        success: true,
        message: "All activities already have HR zones data",
        updated: 0,
      });
    }

    console.log(`[Migrate HR Zones] Found ${activitiesWithoutHR.length} activities without HR zones`);

    let updated = 0;
    let failed = 0;

    // Fetch HR zones data for each activity
    for (const activity of activitiesWithoutHR) {
      try {
        // Call Garmin Service to get HR zones data
        const response = await fetch(`${GARMIN_SERVICE_URL}/activity/${activity.garminActivityId}/hr-zones`, {
          headers: {
            "user-id": userId.toString(),
          },
        });

        if (!response.ok) {
          console.error(`[Migrate HR Zones] Failed to fetch HR zones for activity ${activity.garminActivityId}`);
          failed++;
          continue;
        }

        const hrZones = await response.json();

        // Update activity with HR zones data
        await db
          .update(swimmingActivities)
          .set({
            hrZone1Seconds: hrZones.zone1 || 0,
            hrZone2Seconds: hrZones.zone2 || 0,
            hrZone3Seconds: hrZones.zone3 || 0,
            hrZone4Seconds: hrZones.zone4 || 0,
            hrZone5Seconds: hrZones.zone5 || 0,
          })
          .where(eq(swimmingActivities.id, activity.id));

        updated++;
        console.log(`[Migrate HR Zones] Updated activity ${activity.garminActivityId}`);
      } catch (error) {
        console.error(`[Migrate HR Zones] Error processing activity ${activity.garminActivityId}:`, error);
        failed++;
      }
    }

    console.log(`[Migrate HR Zones] Migration complete: ${updated} updated, ${failed} failed`);

    res.json({
      success: true,
      message: `Migration complete: ${updated} activities updated, ${failed} failed`,
      updated,
      failed,
      total: activitiesWithoutHR.length,
    });
  } catch (error) {
    console.error("[Migrate HR Zones] Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to migrate HR zones data",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
