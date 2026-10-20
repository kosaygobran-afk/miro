import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// Opt-in checks against the same production build. This does not replace real-device review.
export default defineConfig(base, {
  testMatch: [
    "product-card-sections.spec.ts",
    "product-card-widgets.spec.ts",
    "product-image-magnifier.spec.ts",
    "navigation-bar.spec.ts",
    "navigation-loading-bar.spec.ts",
    "motion.spec.ts",
    "customer-evolution.spec.ts",
    "product-preview-styles.spec.ts",
    "product-preview-response.spec.ts",
    "store-loading.spec.ts",
  ],
  workers: 3,
  projects: [
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "webkit-iphone", use: { ...devices["iPhone 13"] } },
  ],
});
