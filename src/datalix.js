import * as cheerio from 'cheerio';

const SERVER_PAGE = /\/rent-(?:[^/]*server|[^/]*kvm-server)\/?$|\/2026-sale\/?$/i;

function clean(value) {
  return value.replace(/\s+/g, ' ').trim();
}

export function parseSitemap(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $('url > loc')
    .map((_, element) => clean($(element).text()))
    .get()
    .filter((url) => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' && parsed.hostname === 'datalix.eu' && SERVER_PAGE.test(parsed.pathname);
      } catch {
        return false;
      }
    });
}

function extractSpecs($, card) {
  const specs = [];
  $(card).find('li span').each((_, element) => {
    const value = clean($(element).text());
    if (value && !specs.includes(value)) specs.push(value);
  });
  return specs.slice(0, 12);
}

export function parseProducts(html, pageUrl) {
  const $ = cheerio.load(html);
  const pageTitle = clean($('h1').first().text()) || new URL(pageUrl).pathname;
  const products = [];

  $('#packages .dx-card').each((_, card) => {
    const name = clean($(card).find('h3').first().text());
    const price = clean($(card).find('.dx-price').first().text());
    const orderAnchors = $(card).find('a[href*="/cp/order/config/"]');
    const configureAnchor = orderAnchors.filter((_, element) => !clean($(element).text()).toLowerCase().includes('sold out')).first();
    const soldOutControl = $(card).find('a, span').filter((_, element) => clean($(element).text()).toLowerCase() === 'sold out').first();
    const orderUrlRaw = configureAnchor.attr('href');
    const isSoldOut = soldOutControl.length > 0;

    // Only treat cards with an explicit order control as monitorable inventory.
    if (!name || (!orderUrlRaw && !isSoldOut)) return;
    if (configureAnchor.length && isSoldOut) {
      throw new Error(`Ambiguous availability controls for ${name} on ${pageUrl}`);
    }

    const orderUrl = orderUrlRaw ? new URL(orderUrlRaw, pageUrl).href : null;
    const key = `${new URL(pageUrl).pathname}|${name.toLocaleLowerCase('en-US')}`;
    products.push({
      key,
      name,
      price,
      pageTitle,
      pageUrl,
      orderUrl,
      available: Boolean(orderUrl),
      specs: extractSpecs($, card),
    });
  });

  return products;
}
