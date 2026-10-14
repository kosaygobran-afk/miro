import "server-only";

export type PaymentMethod = "credit_card" | "bit";
export type PaymentLocale = "he" | "en";
export type PaymentState =
  | "pending"
  | "authorized"
  | "captured"
  | "declined"
  | "cancelled"
  | "unknown"
  | "refunded"
  | "partially_refunded";

export type CapabilityState = "enabled" | "disabled" | "unverified";

/** Capabilities describe the configured merchant account, never a UI choice. */
export interface PaymentCapabilities {
  hostedCard: CapabilityState;
  bit: CapabilityState;
  installments: CapabilityState;
  authorizeCapture: CapabilityState;
  partialRefund: CapabilityState;
  tokenizedRecurring: CapabilityState;
  settlementLookup: CapabilityState;
  wallets: { applePay: CapabilityState; googlePay: CapabilityState };
  emvTerminal: CapabilityState;
  tapOnPhone: CapabilityState;
  masavDirectDebit: CapabilityState;
  noObligo: { state: CapabilityState; approvedMeaning?: string };
}

export interface HostedSessionInput {
  attemptId: string;
  amountMinor: number;
  currency: "ILS";
  method: PaymentMethod;
  locale: PaymentLocale;
  callbackUrl: string;
  successUrl: string;
  failureUrl: string;
  cancelUrl: string;
  installments?: number;
}

export interface HostedSession {
  providerRequestId: string;
  hostedUrl: string;
}

export interface PaymentSnapshot {
  state: PaymentState;
  transactionKind: "charge" | "authorization" | "refund" | "unknown";
  amountMinor: number | null;
  currency: string | null;
  transactionId: string | null;
  attemptReference: string | null;
  merchantReference: string | null;
}

export interface RefundSnapshot {
  state: "succeeded" | "pending" | "failed" | "unknown";
  transactionKind: "refund" | "unknown";
  amountMinor: number | null;
  currency: string | null;
  refundId: string | null;
  requestReference: string | null;
  merchantReference: string | null;
}

export interface VerifiedNotification {
  providerRequestId: string | null;
  providerTransactionId: string | null;
  attemptReference: string | null;
  fingerprint: string;
}

export type RefundResult =
  | { state: "verified"; providerTransactionId: string; amountMinor: number }
  | {
      state: "pending" | "unknown";
      providerTransactionId: string;
      amountMinor: number;
    };

export interface PaymentGateway {
  readonly provider: string;
  readonly capabilities: PaymentCapabilities;
  createHostedSession(input: HostedSessionInput): Promise<HostedSession>;
  queryPayment(input: {
    providerRequestId?: string;
    providerTransactionId?: string;
    attemptReference?: string;
  }): Promise<PaymentSnapshot>;
  verifyNotification(rawBody: string, headers: Headers): VerifiedNotification;
  refund(input: {
    transactionId: string;
    amountMinor: number;
    effectKey: string;
  }): Promise<RefundResult>;
  queryRefund(input: {
    effectKey: string;
    providerRefundId?: string;
  }): Promise<RefundSnapshot>;
}

/**
 * Extension contracts only. No MASAV, recurring, token, wallet, EMV or tap-on-phone
 * operation is exposed as supported until a concrete account-backed adapter exists.
 */
export interface BankDebitProvider {
  createMandate(input: {
    customerReference: string;
    authorizationReference: string;
  }): Promise<{ mandateId: string }>;
  debit(input: {
    mandateId: string;
    amountMinor: number;
    effectKey: string;
  }): Promise<{ state: PaymentState; providerTransactionId: string | null }>;
  queryDebit(input: {
    providerTransactionId: string;
  }): Promise<PaymentSnapshot>;
}

export interface RecurringPaymentProvider {
  createRecurringToken(input: {
    attemptId: string;
    consentReference: string;
  }): Promise<{ tokenReference: string }>;
  cancelRecurring(input: {
    tokenReference: string;
    effectKey: string;
  }): Promise<{ state: "cancelled" | "pending" | "unknown" }>;
}

export type JsonObject = Record<string, unknown>;
export type HttpTransport = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

export class ProviderProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderProtocolError";
  }
}

export class ProviderRequestUnknownError extends Error {
  constructor(
    message = "Payment provider outcome is unknown; reconcile before retrying",
  ) {
    super(message);
    this.name = "ProviderRequestUnknownError";
  }
}

export function assertAmountMinor(amountMinor: number): void {
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0 ||
    amountMinor > 999_999_999_999
  ) {
    throw new RangeError(
      "amountMinor must be a positive supported SQL numeric(12,2) amount in agorot",
    );
  }
}

export function amountMinorToNis(amountMinor: number): number {
  assertAmountMinor(amountMinor);
  return Number((amountMinor / 100).toFixed(2));
}

export function nisToAmountMinor(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor > 0 && minor <= 999_999_999_999
    ? minor
    : null;
}

export function unconfiguredCapabilities(): PaymentCapabilities {
  return {
    hostedCard: "disabled",
    bit: "disabled",
    installments: "disabled",
    authorizeCapture: "disabled",
    partialRefund: "disabled",
    tokenizedRecurring: "disabled",
    settlementLookup: "disabled",
    wallets: { applePay: "disabled", googlePay: "disabled" },
    emvTerminal: "disabled",
    tapOnPhone: "disabled",
    masavDirectDebit: "disabled",
    noObligo: { state: "unverified" },
  };
}
