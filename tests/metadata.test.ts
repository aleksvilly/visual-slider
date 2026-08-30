import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractPageMetadata,
  isPrivateOrReservedIp,
  MetadataFetchError,
  resolvePublicTarget,
  type DnsResolver,
} from '../src/lib/analysis/metadata.server';

const publicResolver: DnsResolver = async () => [{ address: '93.184.216.34', family: 4 }];

test('rejects malformed and non-HTTP URLs', async () => {
  await assert.rejects(() => resolvePublicTarget('not a url', publicResolver), MetadataFetchError);
  await assert.rejects(() => resolvePublicTarget('file:///etc/passwd', publicResolver), /Only public HTTP/);
  await assert.rejects(() => resolvePublicTarget('https://user:pass@example.com/', publicResolver), /credentials/);
});

test('rejects localhost, private DNS answers, and mixed public/private answers', async () => {
  await assert.rejects(() => resolvePublicTarget('http://localhost/test', publicResolver), /Local and reserved/);
  await assert.rejects(
    () => resolvePublicTarget('https://private.example.net', async () => [{ address: '10.0.0.8', family: 4 }]),
    /Private or reserved/,
  );
  await assert.rejects(
    () => resolvePublicTarget('https://rebind.example.net', async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]),
    /Private or reserved/,
  );
});

test('classifies representative reserved IPv4 and IPv6 ranges', () => {
  for (const address of ['0.0.0.0', '127.0.0.1', '169.254.1.1', '172.16.0.1', '192.168.1.1', '::1', 'fc00::1', 'fe80::1', '2001:db8::1', '::ffff:10.0.0.1']) {
    assert.equal(isPrivateOrReservedIp(address), true, address);
  }
  assert.equal(isPrivateOrReservedIp('93.184.216.34'), false);
  assert.equal(isPrivateOrReservedIp('2606:4700:4700::1111'), false);
});

test('accepts a DNS-pinned public target', async () => {
  const target = await resolvePublicTarget('https://example.net/products/1', publicResolver);
  assert.equal(target.address, '93.184.216.34');
  assert.equal(target.url.protocol, 'https:');
});

test('extracts canonical, Open Graph, image, site, creator, and structured price metadata', () => {
  const html = `
    <!doctype html><html><head>
      <title>Fallback &amp; title</title>
      <link rel="canonical" href="/products/modern-chair">
      <meta property="og:title" content="Modern Chair">
      <meta property="og:image" content="/media/chair.jpg">
      <meta property="og:site_name" content="Example Design">
      <meta name="description" content="A sculptural oak chair.">
      <script type="application/ld+json">
        {"@type":"Product","name":"Chair","brand":{"name":"Studio One"},"offers":{"price":"349.50","priceCurrency":"EUR"}}
      </script>
    </head><body></body></html>`;
  const metadata = extractPageMetadata(html, 'https://shop.example.net/item?id=1', {
    status: 200,
    bytes: html.length,
  });
  assert.equal(metadata.canonicalUrl, 'https://shop.example.net/products/modern-chair');
  assert.equal(metadata.title, 'Modern Chair');
  assert.equal(metadata.imageUrl, 'https://shop.example.net/media/chair.jpg');
  assert.equal(metadata.siteName, 'Example Design');
  assert.equal(metadata.creator, 'Studio One');
  assert.equal(metadata.priceAmount, 349.5);
  assert.equal(metadata.priceCurrency, 'EUR');
  assert.equal(metadata.description, 'A sculptural oak chair.');
});
