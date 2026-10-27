import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { createUserGoal, deleteUserGoal, listUserGoals, updateUserGoal } from "../db_goals";

const goalInput = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.string().min(1).max(32),
  targetValue: z.number().positive().nullable(),
  unit: z.string().max(24).nullable(),
});

export const goalsRouter = router({
  list: protectedProcedure.query(({ ctx }) => listUserGoals(ctx.user.id)),
  create: protectedProcedure.input(goalInput).mutation(({ ctx, input }) => createUserGoal(ctx.user.id, input)),
  update: protectedProcedure
    .input(goalInput.partial().extend({ id: z.number().int().positive(), currentValue: z.number().min(0).optional() }))
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input;
      return updateUserGoal(ctx.user.id, id, rest);
    }),
  remove: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => deleteUserGoal(ctx.user.id, input.id)),
});
