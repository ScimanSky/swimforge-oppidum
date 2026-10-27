type CapacitorGlobal = { isNativePlatform?: () => boolean };

/** True inside the Capacitor shell (phase 1). Always false in the browser. */
export function isNativePlatform(): boolean {
  const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
  try {
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}
