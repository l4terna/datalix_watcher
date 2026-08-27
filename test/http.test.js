import assert from 'node:assert/strict';
import test from 'node:test';
import { createRandomWindowScheduler, fetchText } from '../src/http.js';

test('does not amplify an HTTP 429 with immediate retries', async () => {
  let requests = 0;
  await assert.rejects(
    fetchText('https://datalix.eu/test', {
      timeoutSeconds: 3,
      retries: 2,
      fetchImpl: async () => {
        requests += 1;
        return new Response('rate limited', { status: 429 });
      },
    }),
    /HTTP 429/,
  );
  assert.equal(requests, 1);
});

test('random scheduler preserves the minimum gap and spans its window', async () => {
  const schedule = createRandomWindowScheduler({
    itemCount: 3,
    windowMs: 60,
    minGapMs: 10,
    random: () => 1,
  });
  const starts = [];
  await Promise.all(Array.from({ length: 3 }, async () => {
    await schedule();
    starts.push(Date.now());
  }));
  assert.ok(starts[0] >= Date.now() - 50);
  assert.ok(starts[1] - starts[0] >= 15);
  assert.ok(starts[2] - starts[1] >= 15);
});
