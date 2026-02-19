import {
  awardActionXp,
  invalidateLeaderboardCache,
  invalidateUserCache,
  protectedProcedure,
  router,
  z,
} from "./_shared";
import { COMMUNITY_REACTION_EMOJI_MAP, COMMUNITY_REACTION_TYPES } from "./community.reaction-types";

type ReadablePost = {
  ownerId: number;
};

type RequirePostReadable = (userId: number, postId: number) => Promise<ReadablePost>;

export function createCommunityReactionsRouter(input: { requirePostReadable: RequirePostReadable }) {
  const { requirePostReadable } = input;

  return router({
    toggle: protectedProcedure
      .input(
        z.object({
          postId: z.number(),
          reactionType: z.enum(COMMUNITY_REACTION_TYPES),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const postMeta = await requirePostReadable(ctx.user.id, input.postId);
        const { togglePostReaction } = await import("../db_social_enhanced");
        const reaction = await togglePostReaction({
          postId: input.postId,
          userId: ctx.user.id,
          reactionType: input.reactionType,
        });
        let actionXp = null;
        if (reaction) {
          actionXp = await awardActionXp({
            userId: ctx.user.id,
            actionType: "reaction",
            entityId: input.postId,
          });
          if (actionXp.awardedXp > 0) {
            await invalidateUserCache(String(ctx.user.id));
            await invalidateLeaderboardCache();
          }

          // Notify post owner about the reaction.
          try {
            if (postMeta.ownerId !== ctx.user.id) {
              const { getDb } = await import("../db");
              const { sql } = await import("drizzle-orm");
              const db = await getDb();
              if (!db) throw new Error("db not available");
              const actorResult = await db.execute(sql`SELECT name FROM users WHERE id = ${ctx.user.id} LIMIT 1`);
              const actorName = ((actorResult.rows[0] as any)?.name as string | undefined) || "Qualcuno";
              const emoji = COMMUNITY_REACTION_EMOJI_MAP[input.reactionType] || "✨";
              const { createNotification } = await import("../db_social_enhanced");
              const link = `/post/${input.postId}`;
              await createNotification({
                userId: postMeta.ownerId,
                type: "reaction",
                title: "Nuova reazione",
                message: `${actorName} ha reagito ${emoji} al tuo post.`,
                link,
                referenceId: input.postId,
              });
            }
          } catch {
            // Notifications are best-effort.
          }
        }

        return { success: true, reaction, actionXp };
      }),

    list: protectedProcedure
      .input(z.object({ postId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requirePostReadable(ctx.user.id, input.postId);
        const { getPostReactions } = await import("../db_social_enhanced");
        return getPostReactions(input.postId);
      }),

    userReaction: protectedProcedure
      .input(z.object({ postId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requirePostReadable(ctx.user.id, input.postId);
        const { getUserPostReaction } = await import("../db_social_enhanced");
        return getUserPostReaction(input.postId, ctx.user.id);
      }),
  });
}
