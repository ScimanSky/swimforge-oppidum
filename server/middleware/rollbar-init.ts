import Rollbar from "rollbar";
import os from "node:os";

const rollbarEnabled = Boolean(process.env.ROLLBAR_ACCESS_TOKEN);

function inferDeploymentTarget(): string {
  const configured = process.env.DEPLOY_TARGET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "local";
  if (process.env.DOMAIN) return "oracle";
  if (process.env.RENDER_EXTERNAL_HOSTNAME) return "render";
  return "production";
}

function inferRelease(): string | undefined {
  return (
    process.env.APP_RELEASE?.trim() ||
    process.env.APP_COMMIT_SHA?.trim() ||
    process.env.GITHUB_SHA?.trim() ||
    process.env.SOURCE_VERSION?.trim() ||
    undefined
  );
}

const deploymentTarget = inferDeploymentTarget();
const release = inferRelease();
const serverHost =
  process.env.ROLLBAR_SERVER_HOST?.trim() ||
  process.env.DOMAIN?.trim() ||
  process.env.RENDER_EXTERNAL_HOSTNAME?.trim() ||
  os.hostname();

// Initialize Rollbar with access token from environment
export const rollbar = new Rollbar({
  accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
  environment: process.env.NODE_ENV || "production",
  enabled: rollbarEnabled,
  captureUncaught: true,
  captureUnhandledRejections: true,
  payload: {
    server: {
      host: serverHost,
    },
    environment: process.env.NODE_ENV || "production",
    code_version: release,
    custom: {
      deploy_target: deploymentTarget,
      service: "swimforge-backend",
      runtime: "node",
    },
  },
});

// Helper function to log errors
export function captureError(
  error: Error,
  context?: Record<string, any>
) {
  if (!rollbarEnabled) return;
  rollbar.error(error, {
    deployTarget: deploymentTarget,
    release,
    ...context,
  });
}

// Helper function to log messages
export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info"
) {
  if (!rollbarEnabled) return;
  rollbar[level](message, {
    deployTarget: deploymentTarget,
    release,
  });
}

// Test message to verify Rollbar is working
if (process.env.NODE_ENV === "production" && rollbarEnabled) {
  rollbar.info("SwimForge server started", {
    version: release ?? "unknown",
    environment: process.env.NODE_ENV,
    deployTarget: deploymentTarget,
  });
}
