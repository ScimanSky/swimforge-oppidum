import { ENV } from "./env";
import { logger } from "../middleware/logger";

const log = logger.child({ component: "email" });

export type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export function isEmailServiceConfigured() {
  return Boolean(ENV.resendApiKey && ENV.resendFromEmail);
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  if (!isEmailServiceConfigured()) {
    log.warn("[Email] Email service not configured", {
      event: "email:not_configured",
    });
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: ENV.resendFromEmail,
        to: [payload.to],
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      log.error("[Email] Failed to send email", {
        event: "email:send_failed",
        status: response.status,
        statusText: response.statusText,
        detail,
      });
      return false;
    }

    return true;
  } catch (error) {
    log.error("[Email] Error sending email", {
      event: "email:send_error",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return false;
  }
}

export async function sendAccountDeletionConfirmationEmail(params: {
  to: string;
  displayName?: string | null;
  deletedAt: Date;
}) {
  const deletedAtIso = params.deletedAt.toISOString();
  const namePrefix = params.displayName?.trim() ? `${params.displayName.trim()},` : "Ciao,";
  const subject = "Conferma eliminazione account SwimForge";
  const text = `${namePrefix}

La conferma di eliminazione del tuo account SwimForge è stata completata.

Data eliminazione: ${deletedAtIso}

Se non hai richiesto tu questa azione, contatta subito il supporto.
`;

  const html = `
    <p>${namePrefix}</p>
    <p>La conferma di eliminazione del tuo account <strong>SwimForge</strong> è stata completata.</p>
    <p><strong>Data eliminazione:</strong> ${deletedAtIso}</p>
    <p>Se non hai richiesto tu questa azione, contatta subito il supporto.</p>
  `;

  return sendEmail({
    to: params.to,
    subject,
    text,
    html,
  });
}
