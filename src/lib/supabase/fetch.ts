/**
 * Supabase is a remote dependency, so a slow or unreachable network must never
 * hold a render or an analytics beacon open for the platform's full timeout.
 *
 * These fetchers add a hard deadline to every server-side Supabase request and
 * share a process-local transport breaker. After repeated transport failures
 * the breaker opens for a cooldown and rejects immediately, which stops retry
 * storms while the upstream is unavailable. Any HTTP response closes it again;
 * this tracks reachability, not endpoint health.
 */
const DEFAULT_TIMEOUT_MS = 15_000;
export const FAST_TIMEOUT_MS = 4_000;
export const PUBLIC_TIMEOUT_MS = 6_000;

const FAILURE_THRESHOLD = 2;
const BREAKER_COOLDOWN_MS = 30_000;

let consecutiveFailures = 0;
let openUntil = 0;
let recovering = false;

// Both breaker errors are abort-shaped so the installed Supabase SDK stops
// retrying idempotent reads immediately. Their `code` still distinguishes an
// outage from a caller cancellation.
export class SupabaseUnavailableError extends Error {
  readonly code = "SUPABASE_UNAVAILABLE";

  constructor() {
    super("Supabase is temporarily unavailable.");
    this.name = "AbortError";
  }
}

export class SupabaseTimeoutError extends Error {
  readonly code = "SUPABASE_TIMEOUT";

  constructor(timeoutMs: number) {
    super(`Supabase request timed out after ${timeoutMs}ms.`);
    this.name = "AbortError";
  }
}

/** True while the breaker is short-circuiting Supabase requests. */
export function isSupabaseUnavailable(now = Date.now()): boolean {
  return openUntil > now;
}

function noteSuccess(): void {
  consecutiveFailures = 0;
  openUntil = 0;
  recovering = false;
}

function noteFailure(): void {
  const now = Date.now();

  // While probing after a cooldown, one failed probe reopens immediately.
  if (recovering) {
    openUntil = now + BREAKER_COOLDOWN_MS;
    return;
  }

  consecutiveFailures += 1;
  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    consecutiveFailures = 0;
    openUntil = now + BREAKER_COOLDOWN_MS;
    recovering = true;
  }
}

function isTransportFailure(error: unknown): boolean {
  // Undici surfaces connection failures as TypeError ("fetch failed"); our
  // AbortSignal deadline surfaces as TimeoutError. Caller cancellations are
  // AbortError and must not be treated as an upstream outage.
  const name = (error as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "TypeError";
}

function createSupabaseFetch(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    if (isSupabaseUnavailable()) throw new SupabaseUnavailableError();

    const timeout = AbortSignal.timeout(timeoutMs);
    const requestSignal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined);

    try {
      const response = await fetch(input, {
        ...init,
        signal: requestSignal
          ? AbortSignal.any([requestSignal, timeout])
          : timeout,
      });
      noteSuccess();
      return response;
    } catch (error) {
      const timedOut = timeout.aborted && !requestSignal?.aborted;
      if (timedOut) {
        noteFailure();
        throw new SupabaseTimeoutError(timeoutMs);
      }
      if (isTransportFailure(error)) noteFailure();
      throw error;
    }
  };
}

/** General server requests, including management writes. */
export const supabaseFetch = createSupabaseFetch(DEFAULT_TIMEOUT_MS);

/**
 * Non-critical request paths (analytics, session personalization, proxy claim
 * refresh) must settle quickly so a degraded upstream cannot delay rendering.
 */
export const supabaseFetchFast = createSupabaseFetch(FAST_TIMEOUT_MS);

/** Anonymous presentation and catalog reads. */
export const supabaseFetchPublic = createSupabaseFetch(PUBLIC_TIMEOUT_MS);
