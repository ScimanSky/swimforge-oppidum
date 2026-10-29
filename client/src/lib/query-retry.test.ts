import { TRPCClientError } from "@trpc/client";
import { describe, expect, it } from "vitest";
import { shouldRetryQuery } from "./query-retry";

const trpcError = (code: string) =>
  TRPCClientError.from({ error: { message: code, code: -32600, data: { code, httpStatus: 400 } } } as never);

describe("shouldRetryQuery", () => {
  it("never retries what a retry cannot change", () => {
    for (const code of ["NOT_FOUND", "FORBIDDEN", "UNAUTHORIZED", "BAD_REQUEST"]) {
      expect(trpcError(code).data?.code).toBe(code);
      expect(shouldRetryQuery(0, trpcError(code))).toBe(false);
    }
  });

  it("anything else keeps TanStack Query's default: three retries", () => {
    for (const error of [trpcError("INTERNAL_SERVER_ERROR"), trpcError("TIMEOUT"), new TypeError("Failed to fetch"), null]) {
      expect([0, 1, 2, 3].map((failureCount) => shouldRetryQuery(failureCount, error))).toEqual([
        true,
        true,
        true,
        false,
      ]);
    }
  });
});
