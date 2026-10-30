/** Direct messages are deleted by the server after 1 year (VITE_DM_RETENTION_DAYS overrides). */
export const DM_RETENTION_DAYS = (() => {
  const days = Number(import.meta.env.VITE_DM_RETENTION_DAYS ?? 365);
  return Number.isFinite(days) && days > 0 ? days : 365;
})();

/** «I messaggi vengono eliminati automaticamente dal server dopo 1 anno.» */
export function dmRetentionNote(days: number = DM_RETENTION_DAYS): string {
  const span = days === 365 ? "1 anno" : `${days} giorni`;
  return `I messaggi vengono eliminati automaticamente dal server dopo ${span}.`;
}
