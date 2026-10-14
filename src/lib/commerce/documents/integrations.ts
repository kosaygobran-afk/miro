import "server-only";

export type ExternalEffectState<T> =
  | { state: "complete"; value: T }
  | { state: "pending" }
  | { state: "unknown" }
  | { state: "rejected"; reasonCode: string }
  | { state: "unavailable"; reasonCode: string };

export interface TaxAllocationRequest {
  operationId: string;
  issueSnapshotHash: string;
  documentId: string;
  documentNumber: string;
  businessRegistrationNumber: string;
  customerRegistrationNumber: string;
  amountAgorot: number;
  currency: "ILS";
}

export interface TaxAllocationValue {
  allocationNumber: string;
  providerReference: string;
  verifiedAt: string;
}

export interface TaxAllocationProvider {
  readonly configured: boolean;
  request(
    input: TaxAllocationRequest,
  ): Promise<ExternalEffectState<TaxAllocationValue>>;
  query(operationId: string): Promise<ExternalEffectState<TaxAllocationValue>>;
}

export interface SignRequest {
  operationId: string;
  issueSnapshotHash: string;
  unsignedPdf: Uint8Array;
  unsignedPdfSha256: string;
}

export interface SignedArtifact {
  pdf: Uint8Array;
  sha256: string;
  signerReference: string;
  signedAt: string;
}

export interface DocumentSigner {
  readonly configured: boolean;
  sign(input: SignRequest): Promise<ExternalEffectState<SignedArtifact>>;
  query(operationId: string): Promise<ExternalEffectState<SignedArtifact>>;
}

/** Number reservation must be backed by an idempotent DB operation, never max(number)+1. */
export interface DocumentNumberRepository {
  reserve(input: {
    operationId: string;
    issueSnapshotHash: string;
    documentType: string;
  }): Promise<ExternalEffectState<{ number: string; reservedAt: string }>>;
  getByOperation(
    operationId: string,
  ): Promise<ExternalEffectState<{ number: string; reservedAt: string }>>;
}

export const unavailableTaxAllocationProvider: TaxAllocationProvider = {
  configured: false,
  async request() {
    return { state: "unavailable", reasonCode: "allocation_not_configured" };
  },
  async query() {
    return { state: "unavailable", reasonCode: "allocation_not_configured" };
  },
};

export const unavailableDocumentSigner: DocumentSigner = {
  configured: false,
  async sign() {
    return { state: "unavailable", reasonCode: "signer_not_configured" };
  },
  async query() {
    return { state: "unavailable", reasonCode: "signer_not_configured" };
  },
};

/**
 * First delivery may be sent once. Any timeout/pending/unknown resume only queries the same
 * operation ID. A rejected/unavailable effect is surfaced for deliberate operator handling.
 */
export async function startOrReconcileEffect<T>(input: {
  operationId: string;
  storedState: "not_started" | "pending" | "unknown" | "complete" | "rejected";
  storedValue?: T;
  start: (operationId: string) => Promise<ExternalEffectState<T>>;
  query: (operationId: string) => Promise<ExternalEffectState<T>>;
}): Promise<ExternalEffectState<T>> {
  if (!input.operationId.trim()) throw new TypeError("operationId is required");
  if (input.storedState === "complete") {
    return input.storedValue === undefined
      ? { state: "unknown" }
      : { state: "complete", value: input.storedValue };
  }
  if (input.storedState === "rejected")
    return { state: "rejected", reasonCode: "previously_rejected" };
  if (input.storedState === "not_started") {
    try {
      return await input.start(input.operationId);
    } catch {
      return { state: "unknown" };
    }
  }
  try {
    return await input.query(input.operationId);
  } catch {
    return { state: "unknown" };
  }
}
