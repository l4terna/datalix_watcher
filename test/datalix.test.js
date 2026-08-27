import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProducts, parseSitemap } from '../src/datalix.js';

test('discovers all server inventory pages and ignores unrelated products', () => {
  const xml = `<urlset>
    <url><loc>https://datalix.eu/rent-xeon-kvm-server</loc></url>
    <url><loc>https://datalix.eu/rent-sale-dedicated-server</loc></url>
    <url><loc>https://datalix.eu/rent-gameserver</loc></url>
    <url><loc>https://datalix.eu/rent-webhosting</loc></url>
    <url><loc>https://evil.example/rent-kvm-server</loc></url>
  </urlset>`;
  assert.deepEqual(parseSitemap(xml), [
    'https://datalix.eu/rent-xeon-kvm-server',
    'https://datalix.eu/rent-sale-dedicated-server',
    'https://datalix.eu/rent-gameserver',
  ]);
});

test('extracts explicit order and sold-out controls from product cards', () => {
  const html = `<h1>Xeon KVM Server</h1><section id="packages">
    <div class="dx-card"><h3>KVM Server S</h3><span class="dx-price">5.99 €</span>
      <li><span>4 Xeon vCores</span></li><a href="/cp/order/config/2/abc">Configure now</a></div>
    <div class="dx-card"><h3>KVM Server M</h3><span class="dx-price">9.99 €</span>
      <a href="/cp/order/config/2/def">Sold out</a></div>
  </section>`;
  const products = parseProducts(html, 'https://datalix.eu/rent-xeon-kvm-server');
  assert.equal(products.length, 2);
  assert.deepEqual(products.map(({ name, available }) => ({ name, available })), [
    { name: 'KVM Server S', available: true },
    { name: 'KVM Server M', available: false },
  ]);
  assert.equal(products[0].orderUrl, 'https://datalix.eu/cp/order/config/2/abc');
});
