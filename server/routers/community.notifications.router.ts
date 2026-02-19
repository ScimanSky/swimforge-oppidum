import { protectedProcedure, router, z } from "./_shared";

export const communityNotificationsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).optional(),
          onlyUnread: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { getUserNotifications } = await import("../db_social_enhanced");
      return getUserNotifications({
        userId: ctx.user.id,
        limit: input?.limit,
        onlyUnread: input?.onlyUnread,
      });
    }),

  markRead: protectedProcedure
    .input(z.object({ notificationIds: z.array(z.number()).optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const { markNotificationsAsRead } = await import("../db_social_enhanced");
      await markNotificationsAsRead(ctx.user.id, input?.notificationIds);
      return { success: true };
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const { getUnreadNotificationCount } = await import("../db_social_enhanced");
    const count = await getUnreadNotificationCount(ctx.user.id);
    return { count };
  }),
});
