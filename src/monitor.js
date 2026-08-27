import { parseProducts, parseSitemap } from './datalix.js';
import { fetchText, mapConcurrent } from './http.js';
import { observeProducts, pruneMissingProducts, readState, writeState } from './state.js';
import { sendTelegram } from './telegram.js';

const discoveryCache = {
  allPages: [],
  emptyPages: new Set(),
  nextDiscoveryAt: 0,
};

export async function runCheck(config, { logger, dryRun = false, fetchImpl = fetch } = {}) {
  const state = await readState(config.stateFile);
  const discoveryDue = discoveryCache.allPages.length === 0 || Date.now() >= discoveryCache.nextDiscoveryAt;
  let pages;
  if (discoveryDue) {
    const sitemap = await fetchText(config.sitemapUrl, { ...config, retries: config.httpRetries, timeoutSeconds: config.httpTimeoutSeconds, logger, fetchImpl });
    pages = parseSitemap(sitemap);
    if (!pages.length) throw new Error('Sitemap contains no server product pages');
    discoveryCache.allPages = pages;
    discoveryCache.nextDiscoveryAt = Date.now() + config.discoveryIntervalSeconds * 1000;
  } else {
    pages = discoveryCache.allPages.filter((pageUrl) => !discoveryCache.emptyPages.has(pageUrl));
  }

  const pageResults = await mapConcurrent(pages, config.maxConcurrency, async (pageUrl) => {
    try {
      const html = await fetchText(pageUrl, { retries: config.httpRetries, timeoutSeconds: config.httpTimeoutSeconds, logger, fetchImpl });
      const products = parseProducts(html, pageUrl);
      return { pageUrl, products };
    } catch (error) {
      logger.error('Product page check failed', { pageUrl, error: error.message });
      return { pageUrl, error };
    }
  });

  const successful = pageResults.filter((result) => {
    if (result.error) return false;
    if (result.products.length > 0) return true;
    const previouslyHadProducts = Object.values(state.products).some((product) => product.pageUrl === result.pageUrl);
    if (previouslyHadProducts) {
      logger.error('Previously populated product page returned no inventory cards', { pageUrl: result.pageUrl });
      return false;
    }
    logger.warn('Server page currently has no monitorable inventory cards', { pageUrl: result.pageUrl });
    return true;
  });
  const failures = pageResults.length - successful.length;
  if (!successful.length) throw new Error('No Datalix product page produced a valid inventory snapshot');

  if (discoveryDue) {
    discoveryCache.emptyPages = new Set(
      successful.filter((result) => result.products.length === 0).map((result) => result.pageUrl),
    );
  }

  const products = successful.flatMap((result) => result.products);
  if (!products.length) throw new Error('No Datalix product page produced a valid inventory snapshot');
  const populatedPageUrls = successful
    .filter((result) => result.products.length > 0)
    .map((result) => result.pageUrl);
  const pruned = pruneMissingProducts(
    state,
    products,
    populatedPageUrls,
    config.missingChecksBeforePrune,
  );
  if (pruned.length) {
    logger.info('Pruned products missing from consecutive successful checks', {
      products: pruned.map(({ key, name }) => ({ key, name })),
    });
  }
  const now = new Date().toISOString();
  const events = observeProducts(state, products, {
    confirmationsRequired: config.confirmationsRequired,
    notifyOnStartup: config.notifyOnStartup,
    now,
  });
  await writeState(config.stateFile, state);

  if (dryRun && state.outbox.length) {
    logger.info('Dry run: Telegram notification suppressed', { pendingEvents: state.outbox });
  } else if (!dryRun && state.outbox.length) {
    const pending = [...state.outbox];
    await sendTelegram(pending, config, {
      fetchImpl,
      onChunkSent: async (delivered) => {
        const deliveredIds = new Set(delivered.map((event) => event.id));
        state.outbox = state.outbox.filter((event) => !deliveredIds.has(event.id));
        await writeState(config.stateFile, state);
      },
    });
    logger.info('Telegram notification delivered', { events: pending.length });
  }

  const available = products.filter((product) => product.available).length;
  const emptyPages = successful.filter((result) => result.products.length === 0).length;
  logger.info('Datalix check completed', { discovery: discoveryDue, pages: successful.length, emptyPages, failures, products: products.length, available, pruned: pruned.length, newEvents: events.length });
  return { pages: successful.length, failures, products, events, pending: state.outbox.length };
}
