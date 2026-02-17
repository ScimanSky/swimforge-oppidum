import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { CONSENT_TYPES, CONSENT_VERSION, listLatestUserConsents, setManyConsents, setUserConsent, type ConsentType } from "../consent";

const consentTypeEnum = z.enum(CONSENT_TYPES);

export const consentRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const items = await listLatestUserConsents(ctx.user.id);
    const byType = Object.fromEntries(items.map((item) => [item.consentType, item]));

    return {
      versions: CONSENT_VERSION,
      required: {
        terms_acceptance: true,
        privacy_policy: true,
      },
      items,
      byType,
      canUseHealthFeatures: Boolean(byType.health_data_processing?.granted),
    };
  }),

  set: protectedProcedure
    .input(
      z.object({
        consentType: consentTypeEnum,
        granted: z.boolean(),
        consentVersion: z.string().min(1).max(32).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.granted && (input.consentType === "terms_acceptance" || input.consentType === "privacy_policy")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Termini e Privacy sono necessari per usare il servizio.",
        });
      }

      const next = await setUserConsent({
        userId: ctx.user.id,
        consentType: input.consentType as ConsentType,
        granted: input.granted,
        consentVersion: input.consentVersion,
        req: ctx.req,
      });

      if (!next) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Impossibile aggiornare il consenso.",
        });
      }

      return next;
    }),

  setBulk: protectedProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            consentType: consentTypeEnum,
            granted: z.boolean(),
            consentVersion: z.string().min(1).max(32).optional(),
          }),
        ).min(1).max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const invalidRequired = input.items.some(
        (item) => (item.consentType === "terms_acceptance" || item.consentType === "privacy_policy") && !item.granted,
      );

      if (invalidRequired) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Termini e Privacy sono necessari per usare il servizio.",
        });
      }

      return setManyConsents({
        userId: ctx.user.id,
        req: ctx.req,
        items: input.items.map((item) => ({
          consentType: item.consentType as ConsentType,
          granted: item.granted,
          consentVersion: item.consentVersion,
        })),
      });
    }),
});
