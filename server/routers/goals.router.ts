import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { createUserGoal, deleteUserGoal, listUserGoals, updateUserGoal } from "../db_goals";

const goalInput = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.string().min(1).max(32),
  targetValue: z.number().positive().nullable(),
  unit: z.string().max(24).nullable(),
});

const goalNotFound = () => new TRPCError({ code: "NOT_FOUND", message: "Obiettivo non trovato" });

export const goalsRouter = router({
  list: protectedProcedure.query(({ ctx }) => listUserGoals(ctx.user.id)),
  create: protectedProcedure.input(goalInput).mutation(({ ctx, input }) => createUserGoal(ctx.user.id, input)),
  update: protectedProcedure
    .input(goalInput.partial().extend({ id: z.number().int().positive(), currentValue: z.number().min(0).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const row = await updateUserGoal(ctx.user.id, id, rest);
      if (!row) throw goalNotFound();
      return row;
    }),
  remove: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await deleteUserGoal(ctx.user.id, input.id);
      if (!deleted) throw goalNotFound();
      return deleted;
    }),
});
