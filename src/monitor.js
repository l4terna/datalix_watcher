import { parseProducts, parseSitemap } from './datalix.js';
import { fetchText, mapConcurrent } from './http.js';
import { observeProducts, readState, writeState } from './state.js';
import { sendTelegram } from './telegram.js';

export async function runCheck(config, { logger, dryRun = false, fetchImpl = fetch } = {}) {
  const state = await readState(config.stateFile);
  const sitemap = await fetchText(config.sitemapUrl, { ...config, retries: config.httpRetries, timeoutSeconds: config.httpTimeoutSeconds, logger, fetchImpl });
  const pages = parseSitemap(sitemap);
  if (!pages.length) throw new Error('Sitemap contains no server product pages');

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

  const products = successful.flatMap((result) => result.products);
  if (!products.length) throw new Error('No Datalix product page produced a valid inventory snapshot');
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
  logger.info('Datalix check completed', { pages: successful.length, emptyPages, failures, products: products.length, available, newEvents: events.length });
  return { pages: successful.length, failures, products, events, pending: state.outbox.length };
}
