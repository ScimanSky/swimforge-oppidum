import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { deleteDeviceToken, upsertDeviceToken } from "../db_device_tokens";

const tokenSchema = z.string().trim().min(20).max(512);

export const pushRouter = router({
  register: protectedProcedure
    .input(
      z.object({
        token: tokenSchema,
        platform: z.enum(["android", "ios", "web"]),
        appVersion: z.string().trim().max(32).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await upsertDeviceToken(ctx.user.id, {
        token: input.token,
        platform: input.platform,
        appVersion: input.appVersion,
      });
      return { success: true };
    }),

  unregister: protectedProcedure
    .input(z.object({ token: tokenSchema }))
    .mutation(async ({ ctx, input }) => {
      await deleteDeviceToken(ctx.user.id, input.token);
      return { success: true };
    }),
});
