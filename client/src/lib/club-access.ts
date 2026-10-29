/** Where a members-only club page stands while `clubs.get` loads or answers. */
export type ClubAccess = "loading" | "error" | "not-found" | "not-member" | "member";

type ClubQueryLike = {
  data?: unknown;
  isPending: boolean;
  isError: boolean;
  error?: { data?: { code?: string } | null } | null;
};

/**
 * Members-only club pages: a missing club or a secret one (NOT_FOUND, FORBIDDEN) is «not
 * found», any other failure can be retried, and a club the swimmer is not in says so. Never
 * «not a member» for a load error.
 */
export function clubAccess(query: ClubQueryLike): ClubAccess {
  const club = query.data as { is_member?: unknown } | null | undefined;
  if (!club) {
    if (query.isPending) return "loading";
    const code = query.error?.data?.code;
    return query.isError && code !== "NOT_FOUND" && code !== "FORBIDDEN" ? "error" : "not-found";
  }
  return club.is_member ? "member" : "not-member";
}

