import {
  getFollowStarterState,
  getSuggestedUsers,
  getUserPublicProfile,
  protectedProcedure,
  router,
  searchUsers,
  toggleFollow,
  TRPCError,
  z,
} from "./_shared";

export const communityUsersRouter = router({
        getPublicProfile: protectedProcedure
            .input(z.object({ userId: z.number() }))
            .query(async ({ ctx, input }) => {
                const profile = await getUserPublicProfile({
                    viewerUserId: ctx.user.id,
                    targetUserId: input.userId,
                });
                if (!profile) {
                    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
                }

                // Enforce profile visibility unless the viewer is the same user.
                if (!profile.profilePublic && ctx.user.id !== input.userId) {
                    throw new TRPCError({ code: "FORBIDDEN", message: "Questo profilo non è pubblico" });
                }

                return profile;
            }),

        toggleFollow: protectedProcedure
            .input(z.object({ userId: z.number() }))
            .mutation(async ({ ctx, input }) => {
                if (input.userId === ctx.user.id) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "Non puoi seguire te stesso" });
                }
                return toggleFollow({ followerId: ctx.user.id, followingId: input.userId });
            }),

        suggested: protectedProcedure
            .input(z.object({ limit: z.number().min(1).max(10).optional() }).optional())
            .query(async ({ ctx, input }) => {
                return getSuggestedUsers(ctx.user.id, input?.limit ?? 5);
            }),

        followStarter: protectedProcedure
            .input(
                z
                    .object({
                        limit: z.number().min(1).max(10).optional(),
                        target: z.number().min(1).max(10).optional(),
                    })
                    .optional()
            )
            .query(async ({ ctx, input }) => {
                return getFollowStarterState(
                    ctx.user.id,
                    input?.limit ?? 5,
                    input?.target ?? 3
                );
            }),

        search: protectedProcedure
            .input(z.object({ query: z.string().min(1).max(100), limit: z.number().min(1).max(20).optional() }))
            .query(async ({ ctx, input }) => {
                return searchUsers(ctx.user.id, input.query, input.limit ?? 10);
            }),
});
