import assert from 'node:assert/strict';
import test from 'node:test';
import { chunkAvailabilityEvents, formatAvailabilityMessage, sendTelegram } from '../src/telegram.js';

function event(index) {
  return {
    id: String(index),
    kind: index === 0 ? 'new' : 'restocked',
    product: {
      name: `Server <${index}>`,
      price: '9.99 €',
      orderUrl: `https://datalix.eu/cp/order/config/2/${index}?a=1&b=2`,
      pageUrl: 'https://datalix.eu/server',
      specs: ['4 cores', '16 GB Memory', '100 GB Storage'],
    },
  };
}

test('formats escaped Telegram HTML with direct order links', () => {
  const message = formatAvailabilityMessage([event(0)], new Date('2026-08-27T10:00:00Z'));
  assert.match(message, /Server &lt;0&gt;/);
  assert.match(message, /a=1&amp;b=2/);
  assert.match(message, /✨ Новинка/);
});

test('chunks large notification batches and acknowledges each delivered chunk', async () => {
  const events = Array.from({ length: 20 }, (_, index) => event(index));
  assert.ok(chunkAvailabilityEvents(events, 500).length > 1);
  const delivered = [];
  const bodies = [];
  let requests = 0;
  await sendTelegram(events, {
    telegramBotToken: 'token', telegramChatId: '@channel', httpTimeoutSeconds: 3,
  }, {
    fetchImpl: async (_url, init) => {
      requests += 1;
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    onChunkSent: async (chunk) => delivered.push(...chunk),
  });
  assert.ok(requests > 1);
  assert.deepEqual(delivered.map(({ id }) => id), events.map(({ id }) => id));
  assert.ok(bodies.every((body) => body.reply_markup.inline_keyboard.length > 0));
  assert.match(bodies[0].reply_markup.inline_keyboard[0][0].url, /cp\/order\/config/);
});
