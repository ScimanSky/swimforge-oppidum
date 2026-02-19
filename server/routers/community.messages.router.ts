import { protectedProcedure, router, TRPCError, z } from "./_shared";
import {
  checkForwardRecipientAllowed,
  type ForwardTargetType,
  getUserForwardPrivacySettings,
  getUsersById,
} from "./community.forwarding";

type RequirePostReadable = (userId: number, postId: number) => Promise<unknown>;

export function createCommunityMessagesRouter(input: { requirePostReadable: RequirePostReadable }) {
  const { requirePostReadable } = input;

  return router({
    send: protectedProcedure
      .input(
        z.object({
          receiverId: z.number(),
          content: z.string().min(1).max(5000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { sendDirectMessage } = await import("../db_social_enhanced");
        const message = await sendDirectMessage({
          senderId: ctx.user.id,
          receiverId: input.receiverId,
          content: input.content,
        });
        return { success: true, message };
      }),

    forward: protectedProcedure
      .input(
        z.object({
          targetType: z.enum(["post", "story"]),
          targetId: z.number().int().positive(),
          recipientIds: z.array(z.number().int().positive()).min(1).max(10),
          note: z.string().max(500).optional().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const uniqueRecipientIds = Array.from(
          new Set(input.recipientIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0 && id !== ctx.user.id)),
        );

        if (!uniqueRecipientIds.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Seleziona almeno un destinatario valido diverso da te.",
          });
        }

        const recipients = await getUsersById(uniqueRecipientIds);
        const recipientMap = new Map(recipients.map((row) => [row.id, row]));

        const missingRecipientIds = uniqueRecipientIds.filter((id) => !recipientMap.has(id));
        if (missingRecipientIds.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Uno o più destinatari non esistono più.",
          });
        }

        const { getDb } = await import("../db");
        const { sql } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        }

        let ownerId = 0;
        let ownerName = "Nuotatore";
        let previewText: string | null = null;
        let previewMediaUrl: string | null = null;
        let visibility: string | null = null;
        let isActivityPost = false;

        if (input.targetType === "post") {
          await requirePostReadable(ctx.user.id, input.targetId);
          const postResult = await db.execute(sql`
            SELECT
              p.id,
              p.user_id,
              p.content,
              p.media_url,
              p.visibility,
              p.activity_id,
              u.name AS owner_name
            FROM social_posts p
            JOIN users u ON u.id = p.user_id
            WHERE p.id = ${input.targetId}
              AND p.is_deleted = false
            LIMIT 1
          `);
          const post = postResult.rows[0] as
            | {
                id: number;
                user_id: number;
                content: string | null;
                media_url: string | null;
                visibility: string | null;
                activity_id: number | null;
                owner_name: string | null;
              }
            | undefined;

          if (!post) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Post non trovato." });
          }

          ownerId = Number(post.user_id);
          ownerName = post.owner_name?.trim() || "Nuotatore";
          previewText = post.content?.trim() || null;
          previewMediaUrl = post.media_url ?? null;
          visibility = post.visibility ?? "public";
          isActivityPost = post.activity_id != null;
        } else {
          const storyResult = await db.execute(sql`
            SELECT
              s.id,
              s.user_id,
              s.caption,
              s.media_url,
              s.type,
              s.expires_at,
              u.name AS owner_name
            FROM stories s
            JOIN users u ON u.id = s.user_id
            WHERE s.id = ${input.targetId}
              AND s.expires_at > NOW()
            LIMIT 1
          `);
          const story = storyResult.rows[0] as
            | {
                id: number;
                user_id: number;
                caption: string | null;
                media_url: string | null;
                type: string;
                expires_at: Date;
                owner_name: string | null;
              }
            | undefined;

          if (!story) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Story non trovata o scaduta." });
          }

          ownerId = Number(story.user_id);
          ownerName = story.owner_name?.trim() || "Nuotatore";
          previewText = story.caption?.trim() || (story.type === "video" ? "Story video" : "Story");
          previewMediaUrl = story.media_url ?? null;
          visibility = "public";
          isActivityPost = false;
        }

        const ownerPrivacy = await getUserForwardPrivacySettings(ownerId);
        const senderAccess = await checkForwardRecipientAllowed({
          senderId: ctx.user.id,
          recipientId: ctx.user.id,
          ownerId,
          ownerPrivacy,
          targetType: input.targetType as ForwardTargetType,
          visibility,
          isActivityPost,
        });

        if (!senderAccess.allowed && ctx.user.id !== ownerId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: senderAccess.reason ?? "Non hai accesso per inoltrare questo contenuto.",
          });
        }

        const blockedRecipients: Array<{ userId: number; reason: string }> = [];
        const allowedRecipientIds: number[] = [];

        for (const recipientId of uniqueRecipientIds) {
          const allowed = await checkForwardRecipientAllowed({
            senderId: ctx.user.id,
            recipientId,
            ownerId,
            ownerPrivacy,
            targetType: input.targetType as ForwardTargetType,
            visibility,
            isActivityPost,
          });
          if (allowed.allowed) {
            allowedRecipientIds.push(recipientId);
          } else {
            blockedRecipients.push({
              userId: recipientId,
              reason: allowed.reason ?? "Privacy non compatibile con l'inoltro.",
            });
          }
        }

        if (!allowedRecipientIds.length) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: blockedRecipients[0]?.reason ?? "Nessun destinatario è autorizzato a ricevere questo inoltro.",
          });
        }

        const messageType = input.targetType === "post" ? "forward_post" : "forward_story";
        const fallbackText = input.targetType === "post" ? `Post inoltrato da ${ownerName}` : `Story inoltrata da ${ownerName}`;
        const trimmedNote = input.note?.trim() ?? "";
        const content = trimmedNote.length > 0 ? `${fallbackText}\n\n${trimmedNote}` : fallbackText;
        const metadata = {
          targetType: input.targetType,
          targetId: input.targetId,
          ownerId,
          ownerName,
          previewText: previewText?.slice(0, 500) ?? null,
          previewMediaUrl,
          forwardedBy: ctx.user.id,
          forwardedAt: new Date().toISOString(),
        };

        const { sendDirectMessage } = await import("../db_social_enhanced");
        const messages = await Promise.all(
          allowedRecipientIds.map((receiverId) =>
            sendDirectMessage({
              senderId: ctx.user.id,
              receiverId,
              content,
              messageType,
              metadata,
            }),
          ),
        );

        return {
          success: true,
          deliveredCount: messages.length,
          blockedRecipients: blockedRecipients.map((item) => ({
            userId: item.userId,
            userName: recipientMap.get(item.userId)?.name ?? `#${item.userId}`,
            reason: item.reason,
          })),
        };
      }),

    conversation: protectedProcedure
      .input(
        z.object({
          otherUserId: z.number(),
          limit: z.number().min(1).max(100).optional(),
          offset: z.number().min(0).optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const { getConversation } = await import("../db_social_enhanced");
        return getConversation({
          userId1: ctx.user.id,
          userId2: input.otherUserId,
          limit: input.limit,
          offset: input.offset,
        });
      }),

    markRead: protectedProcedure
      .input(z.object({ senderId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { markMessagesAsRead } = await import("../db_social_enhanced");
        await markMessagesAsRead({
          receiverId: ctx.user.id,
          senderId: input.senderId,
        });
        return { success: true };
      }),

    recent: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(50).optional() }).optional())
      .query(async ({ ctx, input }) => {
        const { getRecentConversations } = await import("../db_social_enhanced");
        return getRecentConversations(ctx.user.id, input?.limit);
      }),

    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      const { getUnreadDmCount } = await import("../db_social_enhanced");
      const count = await getUnreadDmCount(ctx.user.id);
      return { count };
    }),
  });
}
