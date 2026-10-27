import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { userGoals, type UserGoal } from "../drizzle/schema";

export type GoalInput = { title: string; category: string; targetValue: number | null; unit: string | null };

export async function listUserGoals(userId: number): Promise<UserGoal[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userGoals).where(eq(userGoals.userId, userId)).orderBy(desc(userGoals.createdAt));
}

export async function createUserGoal(userId: number, input: GoalInput): Promise<UserGoal | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.insert(userGoals).values({ userId, ...input }).returning();
  return row ?? null;
}

export async function updateUserGoal(
  userId: number,
  id: number,
  input: Partial<GoalInput> & { currentValue?: number },
): Promise<UserGoal | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .update(userGoals)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(userGoals.id, id), eq(userGoals.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteUserGoal(userId: number, id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .delete(userGoals)
    .where(and(eq(userGoals.id, id), eq(userGoals.userId, userId)))
    .returning({ id: userGoals.id });
  return rows.length > 0;
}
