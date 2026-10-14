import "server-only";
import { createHash } from "node:crypto";
import { CommerceError } from "./http";
import { createPayPlusGateway, loadPayPlusConfig } from "./payments/payplus";
import { unconfiguredCapabilities } from "./payments";

/** Only server configuration enables collection. Business identity is separate. */
export function loadCommerceRuntime(env: NodeJS.ProcessEnv = process.env) {
  if (env.COMMERCE_GATEWAY_ENABLED !== "true")
    throw new CommerceError("payment_provider_not_configured", 503);
  const config = loadPayPlusConfig(env);
  if (
    config.environment === "production" &&
    env.COMMERCE_PRODUCTION_APPROVED !== "true"
  )
    throw new CommerceError("production_collection_not_approved", 503);
  // The independent issuer is currently draft-only. A switch must never let
  // live customers pay before the approved document process is implemented.
  if (config.environment === "production")
    throw new CommerceError("document_process_not_ready", 503);
  const origin = new URL(env.COMMERCE_APP_ORIGIN ?? "");
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new CommerceError("payment_configuration_invalid", 503);
  const gateway = createPayPlusGateway({ config });
  const merchantRef = createHash("sha256")
    .update(`payplus:${config.environment}:${config.paymentPageUid}`)
    .digest("hex");
  return {
    gateway,
    environment: config.environment,
    merchantRef,
    providerMerchantId: config.paymentPageUid,
    origin: origin.origin,
  };
}

export function commerceReadiness(env: NodeJS.ProcessEnv = process.env) {
  try {
    const runtime = loadCommerceRuntime(env);
    return {
      provider: "payplus",
      environment: runtime.environment,
      configured: true,
      verification: "sandbox_verification_required",
      capabilities: runtime.gateway.capabilities,
      official_issuance_enabled: false,
    };
  } catch {
    return {
      provider: "payplus",
      environment: null,
      configured: false,
      verification: "not_configured",
      capabilities: unconfiguredCapabilities(),
      official_issuance_enabled: false,
    };
  }
}
