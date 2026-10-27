#!/usr/bin/env node
/**
 * Builds the source images for `@capacitor/assets` from the SwimForge logo
 * (client/public/swimforge-logo.png, the same image used as favicon/apple-touch icon):
 *
 *   assets/icon.png         1024x1024, logo centred on #0A1520 (used as the "logo" input:
 *                           adaptive icon foreground/background + legacy launcher icons)
 *   assets/splash.png       2732x2732, logo centred on #0A1520
 *   assets/splash-dark.png  same as splash.png (otherwise the night splashes are derived
 *                           from icon.png at a different scale)
 *
 * Then run:
 *   npx @capacitor/assets generate --android --iconBackgroundColor '#0A1520' \
 *     --iconBackgroundColorDark '#0A1520' --splashBackgroundColor '#0A1520' \
 *     --splashBackgroundColorDark '#0A1520'
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "client/public/swimforge-logo.png");
const OUT_DIR = path.join(ROOT, "assets");
const BACKGROUND = "#0A1520";

// @capacitor/assets insets the adaptive foreground by 16.7% (mipmap-anydpi-v26), so the
// whole image lands in the visible 72dp area; the round badge at 90% stays inside the
// launcher mask (circle/squircle) with a thin #0A1520 ring, legacy icons included.
const ICON_SIZE = 1024;
const ICON_LOGO_RATIO = 0.9;
// Splashes are centre-cropped to each screen; ~25% of the square side reads well
// on portrait phones (it becomes ~37% of the screen width).
const SPLASH_SIZE = 2732;
const SPLASH_LOGO_RATIO = 0.25;

async function compose(size, ratio, outFile) {
  // Trim the transparent margin so the ratio refers to the visible badge.
  const logoSide = Math.round(size * ratio);
  const logo = await sharp(SOURCE)
    .trim()
    .resize(logoSide, logoSide, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
    .composite([{ input: logo, gravity: "center" }])
    .flatten({ background: BACKGROUND })
    .png()
    .toFile(path.join(OUT_DIR, outFile));
  console.log(`assets/${outFile} ${size}x${size}`);
}

await compose(ICON_SIZE, ICON_LOGO_RATIO, "icon.png");
await compose(SPLASH_SIZE, SPLASH_LOGO_RATIO, "splash.png");
await compose(SPLASH_SIZE, SPLASH_LOGO_RATIO, "splash-dark.png");
