let sequence = 0;

/**
 * A Realtime topic of its own for one subscription (`notifications:4` → `notifications:4:7`).
 * supabase.channel(topic) hands back the channel with that topic while it is still in the
 * client's list, and removeChannel only starts leaving (asynchronous): a quick unmount and
 * remount would get the channel that is leaving, already subscribed, and adding a callback to it
 * throws. The topic name is not checked by the server for postgres_changes on a public channel
 * (the table's RLS decides what arrives), so the suffix changes nothing there.
 */
export function uniqueRealtimeTopic(base: string): string {
  sequence += 1;
  return `${base}:${sequence}`;
}
