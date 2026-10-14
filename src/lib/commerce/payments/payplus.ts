import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  amountMinorToNis,
  assertAmountMinor,
  nisToAmountMinor,
  ProviderProtocolError,
  ProviderRequestUnknownError,
  unconfiguredCapabilities,
  type HttpTransport,
  type JsonObject,
  type PaymentCapabilities,
  type PaymentGateway,
  type PaymentSnapshot,
  type RefundSnapshot,
} from "./index";

const SANDBOX_BASE = "https://restapidev.payplus.co.il/api/v1.0";
const PRODUCTION_BASE = "https://restapi.payplus.co.il/api/v1.0";
const PAYPLUS_HOST_SUFFIX = ".payplus.co.il";

export type PayPlusEnvironment = "sandbox" | "production";

export interface PayPlusConfig {
  environment: PayPlusEnvironment;
  apiKey: string;
  secretKey: string;
  paymentPageUid: string;
  /** Explicit account/operator allowlist of enabled modules; defaults to none. */
  enabledMethods?: Array<"credit_card" | "bit">;
  enabledFeatures?: Array<"installments" | "partialRefund">;
  hostedPaymentHosts?: string[];
  trustedReturnHosts?: string[];
}

function nonEmpty(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Missing ${label}`);
  return value.trim();
}

/** Reads server environment only; sandbox and production credentials cannot be mixed. */
export function loadPayPlusConfig(
  env: Record<string, string | undefined> = process.env,
): PayPlusConfig {
  const environment = env.PAYPLUS_ENVIRONMENT;
  if (environment !== "sandbox" && environment !== "production") {
    throw new Error("PAYPLUS_ENVIRONMENT must be sandbox or production");
  }
  const prefix =
    environment === "sandbox" ? "PAYPLUS_SANDBOX" : "PAYPLUS_PRODUCTION";
  const methods = (env[`${prefix}_ENABLED_METHODS`] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const features = (env[`${prefix}_ENABLED_FEATURES`] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const validMethods = methods.filter(
    (item): item is "credit_card" | "bit" =>
      item === "credit_card" || item === "bit",
  );
  const validFeatures = features.filter(
    (item): item is NonNullable<PayPlusConfig["enabledFeatures"]>[number] =>
      ["installments", "partialRefund"].includes(item),
  );
  return {
    environment,
    apiKey: nonEmpty(env[`${prefix}_API_KEY`], `${prefix}_API_KEY`),
    secretKey: nonEmpty(env[`${prefix}_SECRET_KEY`], `${prefix}_SECRET_KEY`),
    paymentPageUid: nonEmpty(env[`${prefix}_PAGE_UID`], `${prefix}_PAGE_UID`),
    enabledMethods: validMethods,
    enabledFeatures: validFeatures,
    hostedPaymentHosts: (env[`${prefix}_HOSTED_PAYMENT_HOSTS`] ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
    trustedReturnHosts: (env[`${prefix}_RETURN_HOSTS`] ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  };
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringField(source: JsonObject, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value))
      return String(value);
  }
  return null;
}

function nestedData(body: JsonObject): JsonObject {
  const data = isObject(body.data) ? body.data : body;
  return data;
}

function parseJson(text: string): JsonObject {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ProviderProtocolError("PayPlus returned invalid JSON");
  }
  if (!isObject(value))
    throw new ProviderProtocolError("PayPlus returned an unexpected response");
  return value;
}

function apiCallSucceeded(body: JsonObject): boolean {
  const results = isObject(body.results) ? body.results : null;
  if (!results) return false;
  const status = stringField(results, "status")?.toLowerCase();
  const code = results.code;
  return status === "success" && (code === 0 || code === "0");
}

function readState(body: JsonObject): PaymentSnapshot["state"] {
  const data = nestedData(body);
  const transaction = isObject(data.transaction) ? data.transaction : data;
  const rawStatus = (
    stringField(
      transaction,
      "transaction_status",
      "payment_status",
      "status",
    ) ?? ""
  ).toLowerCase();
  const rawMethod =
    stringField(
      transaction,
      "charge_method",
      "transaction_type",
      "type",
    )?.toLowerCase() ?? "";
  if (
    ["declined", "failed", "failure", "rejected", "error"].includes(rawStatus)
  )
    return "declined";
  if (["cancelled", "canceled", "voided"].includes(rawStatus))
    return "cancelled";
  if (["refunded", "full_refund"].includes(rawStatus)) return "refunded";
  if (["partially_refunded", "partial_refund"].includes(rawStatus))
    return "partially_refunded";
  if (["pending", "processing", "created"].includes(rawStatus))
    return "pending";
  if (
    ["authorized", "j5"].includes(rawStatus) ||
    rawMethod === "2" ||
    rawMethod === "j5"
  )
    return "authorized";
  // J4 is a completed charge. Require an explicit provider success state as well.
  if (
    ["success", "succeeded", "captured", "paid", "approved"].includes(
      rawStatus,
    ) &&
    ["1", "j4", "charge", "captured"].includes(rawMethod)
  )
    return "captured";
  return "unknown";
}

function readTransactionKind(
  body: JsonObject,
): PaymentSnapshot["transactionKind"] {
  const transaction = pickTransaction(body);
  const raw = (
    stringField(
      transaction,
      "charge_method",
      "transaction_type",
      "type",
      "transaction_kind",
    ) ?? ""
  ).toLowerCase();
  if (["1", "j4", "charge", "captured"].includes(raw)) return "charge";
  if (["2", "j5", "authorization", "authorize", "auth"].includes(raw))
    return "authorization";
  if (
    ["4", "refund", "refund_transaction", "reverse", "reversal"].includes(raw)
  )
    return "refund";
  return "unknown";
}

function unknownRefundSnapshot(candidate?: JsonObject): RefundSnapshot {
  const transaction = candidate ?? {};
  return {
    state: "unknown",
    transactionKind: "unknown",
    amountMinor: nisToAmountMinor(transaction.amount ?? transaction.sum),
    currency: stringField(transaction, "currency_code", "currency"),
    refundId: stringField(transaction, "transaction_uid"),
    requestReference: stringField(transaction, "more_info"),
    merchantReference: stringField(transaction, "payment_page_uid"),
  };
}

function refundRows(body: JsonObject): JsonObject[] {
  if (Array.isArray(body.data)) return body.data.filter(isObject);
  const data = nestedData(body);
  const transaction = isObject(data.transaction) ? data.transaction : data;
  return [transaction];
}

function classifyRefund(body: JsonObject, row: JsonObject): RefundSnapshot {
  const rawKind = (
    stringField(
      row,
      "charge_method",
      "transaction_type",
      "type",
      "transaction_kind",
    ) ?? ""
  ).toLowerCase();
  const kindIsRefund = ["4", "refund", "refund_transaction"].includes(rawKind);
  const status = (
    stringField(row, "transaction_status", "payment_status", "status") ?? ""
  ).toLowerCase();
  const amountMinor = nisToAmountMinor(row.amount ?? row.sum);
  const currency = stringField(row, "currency_code", "currency");
  const refundId = stringField(row, "transaction_uid");
  const requestReference = stringField(row, "more_info");
  const merchantReference = stringField(row, "payment_page_uid");
  const envelopeSucceeded = apiCallSucceeded(body);
  const state: RefundSnapshot["state"] =
    envelopeSucceeded &&
    kindIsRefund &&
    ["success", "succeeded", "approved", "captured"].includes(status) &&
    refundId &&
    amountMinor !== null &&
    currency === "ILS"
      ? "succeeded"
      : envelopeSucceeded &&
          kindIsRefund &&
          ["pending", "processing", "created"].includes(status)
        ? "pending"
        : envelopeSucceeded &&
            kindIsRefund &&
            [
              "failed",
              "declined",
              "rejected",
              "cancelled",
              "canceled",
            ].includes(status)
          ? "failed"
          : "unknown";
  return {
    state,
    transactionKind: kindIsRefund ? "refund" : "unknown",
    amountMinor,
    currency,
    refundId,
    requestReference,
    merchantReference,
  };
}

function pickTransaction(body: JsonObject): JsonObject {
  const data = nestedData(body);
  return isObject(data.transaction) ? data.transaction : data;
}

function validateTrustedHttpsUrl(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`${label} must be an absolute URL`);
  }
  if (url.protocol !== "https:") throw new TypeError(`${label} must use HTTPS`);
  if (url.username || url.password || url.hash)
    throw new TypeError(`${label} must not contain credentials or a fragment`);
  return url.toString();
}

function configuredCapabilities(config: PayPlusConfig): PaymentCapabilities {
  const capabilities = unconfiguredCapabilities();
  const configured = Boolean(
    config.apiKey && config.secretKey && config.paymentPageUid,
  );
  const methods = new Set(config.enabledMethods ?? []);
  const features = new Set(config.enabledFeatures ?? []);
  if (configured && methods.has("credit_card"))
    capabilities.hostedCard = "enabled";
  if (configured && methods.has("bit")) capabilities.bit = "enabled";
  if (configured && features.has("installments"))
    capabilities.installments = "enabled";
  if (configured && features.has("partialRefund"))
    capabilities.partialRefund = "enabled";
  // PayPlus module configuration does not prove wallet availability or no-obligo support.
  capabilities.noObligo = { state: "unverified" };
  return capabilities;
}

export function createPayPlusGateway(options: {
  config: PayPlusConfig;
  transport?: HttpTransport;
}): PaymentGateway {
  const { config } = options;
  if (
    !config.apiKey.trim() ||
    !config.secretKey.trim() ||
    !config.paymentPageUid.trim()
  ) {
    throw new Error(
      "PayPlus API credentials and payment page UID are required",
    );
  }
  const base =
    config.environment === "production" ? PRODUCTION_BASE : SANDBOX_BASE;
  const transport = options.transport ?? fetch;
  const allowedHosts = new Set(
    (config.hostedPaymentHosts?.length
      ? config.hostedPaymentHosts
      : ["payplus.co.il"]
    ).map((host) => host.toLowerCase()),
  );
  const trustedReturnHosts = new Set(
    (config.trustedReturnHosts ?? []).map((host) => host.toLowerCase()),
  );
  const headers = {
    "content-type": "application/json",
    "api-key": config.apiKey,
    "secret-key": config.secretKey,
  };

  async function post(
    path: string,
    body: JsonObject,
  ): Promise<{ response: Response; json: JsonObject }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await transport(`${base}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timeout);
      throw new ProviderRequestUnknownError();
    }
    try {
      const length = Number(response.headers.get("content-length"));
      if (Number.isFinite(length) && length > 256 * 1024)
        throw new ProviderProtocolError("PayPlus response is too large");
      if (!response.body)
        throw new ProviderProtocolError("PayPlus response has no body");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 256 * 1024) {
          await reader.cancel();
          throw new ProviderProtocolError("PayPlus response is too large");
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { response, json: parseJson(new TextDecoder().decode(bytes)) };
    } catch (error) {
      if (controller.signal.aborted) throw new ProviderRequestUnknownError();
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    provider: "payplus",
    capabilities: configuredCapabilities(config),

    async createHostedSession(input) {
      assertAmountMinor(input.amountMinor);
      if (input.currency !== "ILS")
        throw new TypeError("Only ILS is enabled for this PayPlus adapter");
      if (input.locale !== "he" && input.locale !== "en")
        throw new TypeError("locale must be he or en");
      if (input.method !== "credit_card" && input.method !== "bit")
        throw new TypeError("Unsupported PayPlus payment method");
      const capability =
        input.method === "bit"
          ? this.capabilities.bit
          : this.capabilities.hostedCard;
      if (capability !== "enabled")
        throw new Error(
          `PayPlus ${input.method} is not enabled for this configured account`,
        );
      if (!input.attemptId?.trim() || input.attemptId.length > 100)
        throw new TypeError("attemptId is invalid");
      const urls = {
        refURL_callback: validateTrustedHttpsUrl(
          input.callbackUrl,
          "callbackUrl",
        ),
        refURL_success: validateTrustedHttpsUrl(input.successUrl, "successUrl"),
        refURL_failure: validateTrustedHttpsUrl(input.failureUrl, "failureUrl"),
        refURL_cancel: validateTrustedHttpsUrl(input.cancelUrl, "cancelUrl"),
      };
      for (const value of Object.values(urls)) {
        const hostname = new URL(value).hostname.toLowerCase();
        if (!trustedReturnHosts.has(hostname))
          throw new TypeError(
            "Payment return URL host is not in the server allowlist",
          );
      }
      if (input.installments !== undefined) {
        if (input.method !== "credit_card")
          throw new Error(
            "Installments are available only for credit-card sessions",
          );
        if (this.capabilities.installments !== "enabled")
          throw new Error(
            "PayPlus installments are not enabled for this configured account",
          );
        if (
          !Number.isSafeInteger(input.installments) ||
          input.installments < 2 ||
          input.installments > 24
        )
          throw new RangeError("installments must be an integer from 2 to 24");
      }
      const request: JsonObject = {
        payment_page_uid: config.paymentPageUid,
        charge_method: 1,
        amount: amountMinorToNis(input.amountMinor),
        currency_code: input.currency,
        language_code: input.locale,
        allowed_charge_methods: [
          input.method === "bit" ? "bit" : "credit-card",
        ],
        charge_default: input.method === "bit" ? "bit" : "credit-card",
        more_info: input.attemptId,
        sendEmailApproval: false,
        sendEmailFailure: false,
        send_failure_callback: true,
        initial_invoice: false,
        ...urls,
      };
      if (input.installments !== undefined)
        request.payments_selected = input.installments;
      let result: { response: Response; json: JsonObject };
      try {
        result = await post("/PaymentPages/generateLink", request);
      } catch (error) {
        if (error instanceof ProviderRequestUnknownError) throw error;
        throw error;
      }
      if (!result.response.ok)
        throw new ProviderProtocolError(
          `PayPlus link creation returned HTTP ${result.response.status}`,
        );
      if (!apiCallSucceeded(result.json))
        throw new ProviderProtocolError(
          "PayPlus did not confirm payment-link creation",
        );
      const data = nestedData(result.json);
      const providerRequestId = stringField(data, "page_request_uid");
      const link = stringField(data, "payment_page_link");
      if (!providerRequestId || !link)
        throw new ProviderProtocolError(
          "PayPlus response lacks page request UID or hosted link",
        );
      let hosted: URL;
      try {
        hosted = new URL(link);
      } catch {
        throw new ProviderProtocolError(
          "PayPlus returned an invalid hosted link",
        );
      }
      const hostname = hosted.hostname.toLowerCase();
      const trusted = [...allowedHosts].some(
        (host) =>
          hostname === host ||
          (hostname.endsWith(`${PAYPLUS_HOST_SUFFIX}`) &&
            host === "payplus.co.il"),
      );
      if (
        hosted.protocol !== "https:" ||
        !trusted ||
        hosted.username ||
        hosted.password
      ) {
        throw new ProviderProtocolError(
          "PayPlus returned a hosted link outside the configured HTTPS allowlist",
        );
      }
      return { providerRequestId, hostedUrl: hosted.toString() };
    },

    async queryPayment(input) {
      const hasRequest = Boolean(input.providerRequestId?.trim());
      const hasTransaction = Boolean(input.providerTransactionId?.trim());
      const hasAttempt = Boolean(input.attemptReference?.trim());
      if (
        Number(hasRequest) + Number(hasTransaction) + Number(hasAttempt) !==
        1
      )
        throw new TypeError(
          "Provide exactly one PayPlus request UID, transaction UID, or attempt reference",
        );
      if (
        (input.providerRequestId?.length ?? 0) > 200 ||
        (input.providerTransactionId?.length ?? 0) > 200 ||
        (input.attemptReference?.length ?? 0) > 100
      )
        throw new TypeError("PayPlus identifier is too long");
      let result: { response: Response; json: JsonObject };
      try {
        result = await post(
          "/PaymentPages/ipn",
          hasRequest
            ? { payment_request_uid: input.providerRequestId!.trim() }
            : hasTransaction
              ? { transaction_uid: input.providerTransactionId!.trim() }
              : { more_info: input.attemptReference!.trim() },
        );
      } catch {
        return {
          state: "unknown",
          transactionKind: "unknown",
          amountMinor: null,
          currency: null,
          transactionId: input.providerTransactionId?.trim() ?? null,
          attemptReference: null,
          merchantReference: null,
        };
      }
      if (
        !result.response.ok ||
        (isObject(result.json.results) && !apiCallSucceeded(result.json))
      )
        return {
          state: "unknown",
          transactionKind: "unknown",
          amountMinor: null,
          currency: null,
          transactionId: input.providerTransactionId?.trim() ?? null,
          attemptReference: null,
          merchantReference: null,
        };
      const transaction = pickTransaction(result.json);
      const transactionId = stringField(transaction, "transaction_uid");
      return {
        state: readState(result.json),
        transactionKind: readTransactionKind(result.json),
        amountMinor: nisToAmountMinor(transaction.amount ?? transaction.sum),
        currency: stringField(transaction, "currency_code", "currency"),
        transactionId,
        attemptReference: stringField(transaction, "more_info"),
        merchantReference: stringField(transaction, "payment_page_uid"),
      };
    },

    verifyNotification(rawBody, requestHeaders) {
      if (
        typeof rawBody !== "string" ||
        rawBody.length === 0 ||
        rawBody.length > 64 * 1024
      ) {
        throw new ProviderProtocolError(
          "PayPlus callback body is empty or too large",
        );
      }
      if (requestHeaders.get("user-agent") !== "PayPlus")
        throw new ProviderProtocolError(
          "PayPlus callback user-agent is invalid",
        );
      const supplied = requestHeaders.get("hash");
      if (!supplied || !/^[A-Za-z0-9+/]+={0,2}$/.test(supplied))
        throw new ProviderProtocolError(
          "PayPlus callback signature is missing or malformed",
        );
      const body = parseJson(rawBody);
      // PayPlus documents HMAC over JSON.stringify(parsedBody), not the raw wire bytes.
      const serialized = JSON.stringify(body);
      const expected = createHmac("sha256", config.secretKey)
        .update(serialized)
        .digest();
      const actual = Buffer.from(supplied, "base64");
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      ) {
        throw new ProviderProtocolError(
          "PayPlus callback signature did not verify",
        );
      }
      const transaction = pickTransaction(body);
      return {
        providerRequestId: stringField(
          transaction,
          "payment_request_uid",
          "page_request_uid",
        ),
        providerTransactionId: stringField(transaction, "transaction_uid"),
        attemptReference: stringField(transaction, "more_info"),
        fingerprint: createHash("sha256").update(rawBody).digest("hex"),
      };
    },

    async refund(input) {
      assertAmountMinor(input.amountMinor);
      if (this.capabilities.partialRefund !== "enabled")
        throw new Error(
          "PayPlus refund module is not enabled for this configured account",
        );
      if (!input.transactionId.trim())
        throw new TypeError("transactionId is required");
      if (!input.effectKey.trim() || input.effectKey.length > 100)
        throw new TypeError("effectKey is invalid");
      let result: { response: Response; json: JsonObject };
      try {
        result = await post("/Transactions/RefundByTransactionUID", {
          transaction_uid: input.transactionId,
          amount: amountMinorToNis(input.amountMinor),
          more_info: input.effectKey,
          initial_invoice: false,
        });
      } catch {
        return {
          state: "unknown",
          providerTransactionId: input.transactionId,
          amountMinor: input.amountMinor,
        };
      }
      if (!result.response.ok)
        return {
          state: "unknown",
          providerTransactionId: input.transactionId,
          amountMinor: input.amountMinor,
        };
      const data = nestedData(result.json);
      const status = stringField(
        isObject(result.json.results) ? result.json.results : result.json,
        "status",
      )?.toLowerCase();
      const code = isObject(result.json.results)
        ? result.json.results.code
        : undefined;
      const refundId = stringField(
        data,
        "transaction_uid",
        "refund_transaction_uid",
      );
      const confirmedAmount = nisToAmountMinor(data.amount ?? data.sum);
      const confirmedCurrency = stringField(data, "currency_code", "currency");
      // The current reference has contradictory J5 wording; only an explicit success response is accepted.
      if (
        status === "success" &&
        (code === 0 || code === "0") &&
        refundId &&
        confirmedAmount === input.amountMinor &&
        confirmedCurrency === "ILS"
      ) {
        return {
          state: "verified",
          providerTransactionId: refundId,
          amountMinor: input.amountMinor,
        };
      }
      return {
        state: "unknown",
        providerTransactionId: input.transactionId,
        amountMinor: input.amountMinor,
      };
    },

    async queryRefund(input) {
      const effectKey = input.effectKey.trim();
      const providerRefundId = input.providerRefundId?.trim();
      if (!effectKey || effectKey.length > 100)
        throw new TypeError("effectKey is invalid");
      if (
        input.providerRefundId !== undefined &&
        (!providerRefundId || providerRefundId.length > 200)
      )
        throw new TypeError("providerRefundId is invalid");
      let result: { response: Response; json: JsonObject };
      try {
        // PayPlus documents more_info as a Transactions/View search criterion;
        // transaction_uid may narrow the query when the refund UID is known.
        // https://docs.payplus.co.il/reference/post_transactions-view
        result = await post("/Transactions/View", {
          more_info: effectKey,
          ...(providerRefundId ? { transaction_uid: providerRefundId } : {}),
        });
      } catch {
        return unknownRefundSnapshot();
      }
      if (!result.response.ok || !apiCallSucceeded(result.json))
        return unknownRefundSnapshot();

      const exactMatches = refundRows(result.json).filter(
        (row) =>
          stringField(row, "more_info") === effectKey &&
          (!providerRefundId ||
            stringField(row, "transaction_uid") === providerRefundId),
      );
      if (exactMatches.length !== 1) return unknownRefundSnapshot();
      const candidate = exactMatches[0];
      const snapshot = classifyRefund(result.json, candidate);
      if (
        snapshot.requestReference !== effectKey ||
        (providerRefundId && snapshot.refundId !== providerRefundId)
      )
        return unknownRefundSnapshot(candidate);
      return snapshot;
    },
  };
}
