/** Retry a function with exponential backoff on rate-limit (429) or transient errors */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { maxRetries = 4, baseDelay = 2000, label = "" } = {}
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const msg = err?.message || "";
      const isRetryable =
        msg.includes("429") ||
        msg.includes("rate limit") ||
        msg.includes("Rate limit") ||
        msg.includes("Too Many Requests") ||
        msg.includes("ECONNRESET") ||
        msg.includes("fetch failed");

      if (!isRetryable || attempt === maxRetries) throw err;

      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      console.log(`[retry] ${label} attempt ${attempt + 1}/${maxRetries}, waiting ${Math.round(delay)}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/** Process items with limited concurrency */
export async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  processor: (item: T, index: number) => Promise<R>
): Promise<(R | Error)[]> {
  const results: (R | Error)[] = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      try {
        results[i] = await processor(items[i], i);
      } catch (err) {
        results[i] = err instanceof Error ? err : new Error(String(err));
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
