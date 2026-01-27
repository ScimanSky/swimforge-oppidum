import Rollbar from "rollbar";

// Initialize Rollbar with access token from environment
export const rollbar = new Rollbar({
  accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
  environment: process.env.NODE_ENV || "production",
  enabled: !!process.env.ROLLBAR_ACCESS_TOKEN,
  captureUncaught: true,
  captureUnhandledRejections: true,
  payload: {
    server: {
      host: process.env.RENDER_EXTERNAL_HOSTNAME || "localhost",
    },
  },
});

// Helper function to log errors
export function captureError(
  error: Error,
  context?: Record<string, any>
) {
  if (rollbar) {
    rollbar.error(error, context);
  }
}

// Helper function to log messages
export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info"
) {
  if (rollbar) {
    rollbar[level](message);
  }
}

// Test message to verify Rollbar is working
if (process.env.NODE_ENV === "production" && process.env.ROLLBAR_ACCESS_TOKEN) {
  rollbar.info("SwimForge server started", {
    version: "1.0.0",
    environment: process.env.NODE_ENV,
  });
}
