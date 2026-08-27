function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function usefulSpecs(specs) {
  const preferred = specs.filter((spec) => /core|memory|ram|storage|uplink|traffic|location|frankfurt|equnix|cogent/i.test(spec));
  return (preferred.length ? preferred : specs).slice(0, 4);
}

export function formatAvailabilityMessage(events, now = new Date()) {
  const title = events.length === 1
    ? '🚨 <b>Datalix: сервер доступен!</b>'
    : `🚨 <b>Datalix: доступны ${events.length} сервера!</b>`;
  const blocks = events.map((event) => {
    const product = event.product;
    const marker = event.kind === 'new' ? '✨ Новинка' : '🟢 Снова в наличии';
    const specs = usefulSpecs(product.specs);
    return [
      `<b>${escapeHtml(product.name)}</b>`,
      `${marker}${product.price ? ` · 💶 ${escapeHtml(product.price)}/мес.` : ''}`,
      specs.length ? `⚙️ ${escapeHtml(specs.join(' · '))}` : null,
      `👉 <a href="${escapeHtml(product.orderUrl || product.pageUrl)}">Открыть и заказать</a>`,
    ].filter(Boolean).join('\n');
  });
  const timestamp = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'medium',
  }).format(now);
  return `${title}\n\n${blocks.join('\n\n')}\n\n<i>Проверено: ${escapeHtml(timestamp)} МСК</i>`;
}

export function chunkAvailabilityEvents(events, maxMessageLength = 3800) {
  const chunks = [];
  let current = [];
  for (const event of events) {
    const candidate = [...current, event];
    if (current.length && formatAvailabilityMessage(candidate).length > maxMessageLength) {
      chunks.push(current);
      current = [event];
    } else {
      current = candidate;
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendChunk(events, config, fetchImpl) {
  if (!events.length) return;
  const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.telegramChatId,
        text: formatAvailabilityMessage(events),
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: {
          inline_keyboard: events.map(({ product }) => [{
            text: `🛒 ${product.name}`.slice(0, 64),
            url: product.orderUrl || product.pageUrl,
          }]),
        },
      }),
      signal: AbortSignal.timeout(config.httpTimeoutSeconds * 1000),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.ok === true) return;
    lastError = new Error(`Telegram API ${response.status}: ${payload.description || 'unknown error'}`);
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 2) break;
    const retryAfterSeconds = Number(payload.parameters?.retry_after) || 2 ** attempt;
    await wait(Math.min(retryAfterSeconds, 30) * 1000);
  }
  throw lastError;
}

export async function sendTelegram(events, config, { fetchImpl = fetch, onChunkSent } = {}) {
  for (const chunk of chunkAvailabilityEvents(events)) {
    await sendChunk(chunk, config, fetchImpl);
    await onChunkSent?.(chunk);
  }
}
