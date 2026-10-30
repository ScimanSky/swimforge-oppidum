/**
 * The data export reads the whole account: a few downloads an hour are plenty. One budget per
 * user, shared by GET /api/account/export and the tRPC auth.exportMyData of older app builds.
 */
import { createUserRateLimit } from "./ai-rate-limit";

export const dataExportRateLimit = createUserRateLimit({ prefix: "rl:data-export:", windowMs: 60 * 60 * 1000, max: 5 });

export const DATA_EXPORT_RATE_LIMIT_MESSAGE = "Troppe esportazioni. Riprova tra un'ora.";
