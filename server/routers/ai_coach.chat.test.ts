import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const { generateCoachChatReplyMock } = vi.hoisted(() => ({
  generateCoachChatReplyMock: vi.fn(),
}));

vi.mock("../ai_coach_chat", () => ({
  generateCoachChatReply: generateCoachChatReplyMock,
}));

import { aiCoachRouter } from "./admin.router";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 77,
    openId: "coach-test-user",
    email: "athlete@example.com",
    name: "Athlete",
    loginMethod: "email",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("aiCoach.chat input validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateCoachChatReplyMock.mockResolvedValue({
      message: "Risposta di test",
      generatedAt: "2026-02-19T00:00:00.000Z",
      fallback: false,
      provider: "gemini",
    });
  });

  it("delegates valid payload to generateCoachChatReply with trimmed preferences", async () => {
    const caller = aiCoachRouter.createCaller(createAuthContext());
    const result = await caller.chat({
      messages: [{ role: "user", content: "Come imposto la prossima seduta?" }],
      goal: "  migliorare 50 sl  ",
      constraints: "  spalla sensibile  ",
    });

    expect(result).toMatchObject({
      message: "Risposta di test",
      provider: "gemini",
    });
    expect(generateCoachChatReplyMock).toHaveBeenCalledTimes(1);
    expect(generateCoachChatReplyMock).toHaveBeenCalledWith(
      77,
      [{ role: "user", content: "Come imposto la prossima seduta?" }],
      { goal: "migliorare 50 sl", constraints: "spalla sensibile" }
    );
  });

  it("passes null preferences when goal/constraints are omitted", async () => {
    const caller = aiCoachRouter.createCaller(createAuthContext());
    await caller.chat({
      messages: [{ role: "user", content: "Dammi un piano breve per oggi" }],
    });

    expect(generateCoachChatReplyMock).toHaveBeenCalledWith(
      77,
      [{ role: "user", content: "Dammi un piano breve per oggi" }],
      { goal: null, constraints: null }
    );
  });

  it("rejects messages longer than 2000 characters", async () => {
    const caller = aiCoachRouter.createCaller(createAuthContext());
    await expect(
      caller.chat({
        messages: [{ role: "user", content: "x".repeat(2001) }],
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(generateCoachChatReplyMock).not.toHaveBeenCalled();
  });

  it("rejects payloads with more than 20 messages", async () => {
    const caller = aiCoachRouter.createCaller(createAuthContext());
    const tooManyMessages = Array.from({ length: 21 }, (_, idx) => ({
      role: "user" as const,
      content: `messaggio ${idx + 1}`,
    }));

    await expect(
      caller.chat({
        messages: tooManyMessages,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(generateCoachChatReplyMock).not.toHaveBeenCalled();
  });

  it("rejects blank messages after trim", async () => {
    const caller = aiCoachRouter.createCaller(createAuthContext());
    await expect(
      caller.chat({
        messages: [{ role: "user", content: "   " }],
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(generateCoachChatReplyMock).not.toHaveBeenCalled();
  });
});
