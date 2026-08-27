const USER_AGENT = 'DatalixAvailabilityMonitor/1.0';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class HttpStatusError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

export async function fetchText(url, { timeoutSeconds, retries, logger, fetchImpl = fetch }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xml;q=0.9,*/*;q=0.1',
          'cache-control': 'no-cache',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutSeconds * 1000),
      });
      if (!response.ok) throw new HttpStatusError(response.status);
      const text = await response.text();
      if (!text.trim()) throw new Error('empty response');
      return text;
    } catch (error) {
      lastError = error;
      if (error.status === 429) {
        logger?.warn('HTTP 429 received; skipping immediate retry', { url });
        break;
      }
      if (attempt < retries) {
        const waitMs = 500 * 2 ** attempt + Math.floor(Math.random() * 250);
        logger?.warn('HTTP request failed, retrying', { url, attempt: attempt + 1, error: error.message });
        await delay(waitMs);
      }
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastError?.message || 'unknown error'}`);
}

export function createRandomWindowScheduler({ itemCount, windowMs, minGapMs, random = Math.random }) {
  if (itemCount < 1) return async () => {};
  const minimumWindowMs = itemCount * minGapMs;
  if (windowMs < minimumWindowMs) {
    throw new Error(`Request window must be at least ${minimumWindowMs}ms for ${itemCount} requests`);
  }

  const extraMs = windowMs - minimumWindowMs;
  const weights = Array.from({ length: itemCount }, () => Math.max(Number.EPSILON, random()));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const offsets = [];
  let offset = 0;
  for (const weight of weights) {
    offset += minGapMs + extraMs * (weight / totalWeight);
    offsets.push(offset);
  }

  const startedAt = Date.now();
  let index = 0;
  return async function waitForStartSlot() {
    if (index >= offsets.length) throw new Error('No request start slots remaining');
    const target = startedAt + offsets[index];
    index += 1;
    const waitMs = target - Date.now();
    if (waitMs > 0) await delay(waitMs);
  };
}

export async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}
