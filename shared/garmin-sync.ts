/** How many recent Garmin swims a manual sync can import (newest first). */
export const GARMIN_SYNC_COUNTS = [1, 5, 10] as const;

export type GarminSyncCount = (typeof GARMIN_SYNC_COUNTS)[number];

export const DEFAULT_GARMIN_SYNC_COUNT: GarminSyncCount = 10;
