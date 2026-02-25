import { ENV } from "../_core/env";
import { detectImageType, logger, protectedProcedure, router, TRPCError, z } from "./_shared";
import { uploadImageToMediaProviders } from "../lib/image_upload";
import { COMMUNITY_REACTION_EMOJI_MAP, COMMUNITY_REACTION_TYPES } from "./community.reaction-types";

export const communityStoriesRouter = router({
  active: protectedProcedure.query(async ({ ctx }) => {
    const { getActiveStories } = await import("../db_stories");
    return getActiveStories(ctx.user.id);
  }),

  imageKitAuth: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ENV.imagekitPrivateKey || !ENV.imagekitPublicKey || !ENV.imagekitUrlEndpoint) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "ImageKit non configurato sul server.",
      });
    }

    const { createHmac, randomBytes } = await import("crypto");
    const token = randomBytes(16).toString("hex");
    const expire = Math.floor(Date.now() / 1000) + 60 * 10; // 10 minutes
    const signature = createHmac("sha1", ENV.imagekitPrivateKey).update(token + String(expire)).digest("hex");

    return {
      token,
      expire,
      signature,
      publicKey: ENV.imagekitPublicKey,
      urlEndpoint: ENV.imagekitUrlEndpoint,
      folder: `/stories/${ctx.user.id}`,
    } as const;
  }),

  create: protectedProcedure
    .input(
      z.object({
        mediaUrl: z.string().url().optional(),
        imageKitFileId: z.string().min(6).max(200).optional(),
        caption: z.string().max(500).optional(),
        type: z.enum(["image", "video", "text"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { createStory } = await import("../db_stories");
      const story = await createStory(ctx.user.id, {
        mediaUrl: input.mediaUrl ?? null,
        imageKitFileId: input.imageKitFileId ?? null,
        caption: input.caption ?? null,
        type: input.type,
      });
      return { success: true, story };
    }),

  uploadFile: protectedProcedure
    .input(
      z.object({
        caption: z.string().max(500).optional(),
        type: z.enum(["image", "video", "text"]),
        fileBase64: z
          .string()
          .min(1)
          .max(7 * 1024 * 1024, "File troppo grande (max 5MB)")
          .regex(/^[A-Za-z0-9+/=]+$/, "Invalid base64"),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const MAX_BYTES = 5 * 1024 * 1024;
      let buffer: Buffer;
      try {
        buffer = Buffer.from(input.fileBase64, "base64");
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid base64 payload" });
      }
      if (buffer.length > MAX_BYTES) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "File troppo grande (max 5MB)" });
      }

      const detected = detectImageType(buffer);
      if (!detected) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Formato immagine non supportato. Usa JPG, PNG o WEBP." });
      }
      if (detected.mimeType !== input.mimeType) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Il MIME type non corrisponde al contenuto del file." });
      }

      try {
        type SharpPipeline = {
          rotate: () => SharpPipeline;
          resize: (options: { width: number; height: number; fit: "inside"; withoutEnlargement: boolean }) => SharpPipeline;
          jpeg: (options: { quality: number }) => SharpPipeline;
          png: (options: { compressionLevel: number }) => SharpPipeline;
          webp: (options: { quality: number }) => SharpPipeline;
          toBuffer: () => Promise<Buffer>;
        };
        type SharpFn = (input: Buffer) => SharpPipeline;

        const sharpMod = (await import("sharp")) as unknown as { default?: unknown };
        const sharpFn = (sharpMod.default ?? sharpMod) as SharpFn;
        const pipeline = sharpFn(buffer).rotate().resize({ width: 1080, height: 1920, fit: "inside", withoutEnlargement: true });

        if (detected.extension === "jpg") {
          buffer = await pipeline.jpeg({ quality: 85 }).toBuffer();
        } else if (detected.extension === "png") {
          buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
        } else {
          buffer = await pipeline.webp({ quality: 85 }).toBuffer();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`story uploadFile: image resize failed: ${message}`, {
          event: "story:upload_resize_failed",
          userId: ctx.user.id,
          message,
        });
      }

      let publicUrl = "";
      try {
        const uploaded = await uploadImageToMediaProviders({
          buffer,
          mimeType: detected.mimeType,
          folder: `stories/${ctx.user.id}`,
          fileNamePrefix: "story",
          tags: ["story", `user-${ctx.user.id}`],
        });
        publicUrl = uploaded.url;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Upload failed: ${message}` });
      }

      const { createStory } = await import("../db_stories");
      const story = await createStory(ctx.user.id, {
        mediaUrl: publicUrl,
        caption: input.caption ?? null,
        type: input.type,
      });

      return { success: true, story, url: publicUrl };
    }),

  markViewed: protectedProcedure
    .input(z.object({ storyId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { markStoryViewed } = await import("../db_stories");
      return markStoryViewed(input.storyId, ctx.user.id);
    }),

  react: protectedProcedure
    .input(
      z.object({
        storyId: z.number(),
        reactionType: z.enum(COMMUNITY_REACTION_TYPES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { toggleStoryReaction, getStoryReactionSummary } = await import("../db_stories");
        const toggled = await toggleStoryReaction({
          storyId: input.storyId,
          userId: ctx.user.id,
          reactionType: input.reactionType,
        });
        const summary = await getStoryReactionSummary(input.storyId, ctx.user.id);

        if (toggled.reaction && toggled.storyOwnerId !== ctx.user.id) {
          try {
            const { getDb } = await import("../db");
            const { sql } = await import("drizzle-orm");
            const db = await getDb();
            if (!db) throw new Error("db not available");
            const actorResult = await db.execute(sql`SELECT name FROM users WHERE id = ${ctx.user.id} LIMIT 1`);
            const actorName = ((actorResult.rows[0] as any)?.name as string | undefined) || "Qualcuno";
            const emoji = COMMUNITY_REACTION_EMOJI_MAP[input.reactionType] || "✨";
            const { createNotification } = await import("../db_social_enhanced");
            await createNotification({
              userId: toggled.storyOwnerId,
              type: "story_reaction",
              title: "Nuova reazione alla story",
              message: `${actorName} ha reagito ${emoji} alla tua story.`,
              link: "/home",
              referenceId: input.storyId,
            });
          } catch {
            // Notifications are best-effort
          }
        }

        return { success: true, reaction: toggled.reaction, removed: toggled.removed, summary };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("Story not found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Story non trovata." });
        }
        if (message.includes("Story expired")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Questa story è scaduta." });
        }
        throw error;
      }
    }),

  delete: protectedProcedure
    .input(z.object({ storyId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { deleteStory } = await import("../db_stories");
      const deleted = await deleteStory(input.storyId, ctx.user.id);

      if (deleted.imageKitFileId) {
        try {
          const { deleteImageKitFileById } = await import("../lib/imagekit");
          await deleteImageKitFileById(deleted.imageKitFileId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn(`story delete: ImageKit cleanup failed: ${message}`, {
            event: "story:delete_imagekit_cleanup_failed",
            userId: ctx.user.id,
            storyId: input.storyId,
            message,
          });
        }
      }

      return deleted;
    }),

  viewers: protectedProcedure
    .input(z.object({ storyId: z.number() }))
    .query(async ({ input }) => {
      const { getStoryViewers } = await import("../db_stories");
      return getStoryViewers(input.storyId);
    }),
});
