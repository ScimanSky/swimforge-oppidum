/**
 * What stops without the «Trattamento dati salute» consent (health_data_processing), told the
 * same way by the server and the app: the AI never receives heart rate and the other health data
 * of the swims, already imported or new.
 */
export const HEALTH_AI_DISABLED_TITLE = "Analisi AI dei dati sanitari disattivata";

export const HEALTH_AI_DISABLED_MESSAGE =
  "Senza il consenso «Trattamento dati salute» l'AI non analizza le singole nuotate e il Coach non usa frequenza cardiaca, zone cardio, training effect, VO2max, recupero e stress, nemmeno delle nuotate già importate. Consigli, piano e chat del Coach continuano con distanze, tempi e passo. Per riattivarla vai in Impostazioni → Privacy.";

/** Where the consent is given or revoked. */
export const PRIVACY_SETTINGS_PATH = "/settings?tab=privacy";
