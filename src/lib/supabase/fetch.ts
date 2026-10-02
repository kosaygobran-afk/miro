/** Bound server-side Supabase requests so unavailable upstreams settle. */
export const supabaseFetch: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(15_000);
  const requestSignal =
    init?.signal ?? (input instanceof Request ? input.signal : undefined);
  return fetch(input, {
    ...init,
    signal: requestSignal ? AbortSignal.any([requestSignal, timeout]) : timeout,
  });
};
