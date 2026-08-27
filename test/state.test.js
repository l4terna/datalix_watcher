import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyState, observeProducts } from '../src/state.js';

const product = (available, name = 'KVM Server M') => ({
  key: `/rent-xeon-kvm-server|${name.toLowerCase()}`,
  name,
  price: '9.99 €',
  pageTitle: 'Xeon KVM Server',
  pageUrl: 'https://datalix.eu/rent-xeon-kvm-server',
  orderUrl: available ? 'https://datalix.eu/cp/order/config/2/abc' : null,
  available,
  specs: [],
});

test('does not spam current stock on startup and confirms a restock twice', () => {
  const state = emptyState();
  const options = { confirmationsRequired: 2, notifyOnStartup: false };
  assert.deepEqual(observeProducts(state, [product(false)], { ...options, now: '2026-01-01T00:00:00Z' }), []);
  assert.deepEqual(observeProducts(state, [product(true)], { ...options, now: '2026-01-01T00:01:00Z' }), []);
  const events = observeProducts(state, [product(true)], { ...options, now: '2026-01-01T00:02:00Z' });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'restocked');
});

test('announces a newly added available server after confirmation', () => {
  const state = emptyState();
  const options = { confirmationsRequired: 2, notifyOnStartup: false };
  observeProducts(state, [product(false)], { ...options, now: '2026-01-01T00:00:00Z' });
  assert.deepEqual(observeProducts(state, [product(true, 'Brand New')], { ...options, now: '2026-01-01T00:01:00Z' }), []);
  const events = observeProducts(state, [product(true, 'Brand New')], { ...options, now: '2026-01-01T00:02:00Z' });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'new');
});
