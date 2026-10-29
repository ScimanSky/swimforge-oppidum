/** Italian labels of club roles, the same in the club header, members and coach area. */
export const CLUB_ROLE_LABEL: Record<string, string> = {
  owner: "Proprietario",
  admin: "Admin",
  moderator: "Moderatore",
  coach: "Coach",
  member: "Membro",
};

/** Club staff (server CLUB_STAFF_ROLES): moderation, invites, events and the AI coach. */
export const CLUB_STAFF_ROLES = ["owner", "admin", "moderator"];

/** Who may open the coach area (server: meets, workouts, PDF and history accept coaches). */
export const COACH_AREA_ROLES = ["coach", ...CLUB_STAFF_ROLES];

/** Roles an invite link can carry for this inviter: coach links only from owner or admin. */
export function inviteRolesFor(role: string | null | undefined): Array<"member" | "coach"> {
  return role === "owner" || role === "admin" ? ["member", "coach"] : ["member"];
}
