const USER_AGENT = 'DatalixAvailabilityMonitor/1.0';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (!text.trim()) throw new Error('empty response');
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        const waitMs = 500 * 2 ** attempt + Math.floor(Math.random() * 250);
        logger?.warn('HTTP request failed, retrying', { url, attempt: attempt + 1, error: error.message });
        await delay(waitMs);
      }
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastError?.message || 'unknown error'}`);
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
