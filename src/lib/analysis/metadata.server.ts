import { lookup as nodeLookup } from 'node:dns/promises';
import { request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { Json } from '../supabase/database.types';
import type { ExtractedPageMetadata } from './types';

export const METADATA_TIMEOUT_MS = 8_000;
export const METADATA_MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;

export class MetadataFetchError extends Error {}

export type DnsResolver = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;

const defaultResolver: DnsResolver = async (hostname) =>
  nodeLookup(hostname, { all: true, verbatim: true });

function ipv4Bytes(address: string) {
  const parts = address.split('.').map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : null;
}

function ipv6Bytes(address: string): number[] | null {
  const withoutZone = address.split('%')[0]?.toLowerCase();
  if (!withoutZone) return null;
  let value = withoutZone;
  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':');
    const embedded = ipv4Bytes(value.slice(lastColon + 1));
    if (!embedded) return null;
    value = `${value.slice(0, lastColon)}:${((embedded[0]! << 8) | embedded[1]!).toString(16)}:${((embedded[2]! << 8) | embedded[3]!).toString(16)}`;
  }
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const missing = halves.length === 2 ? 8 - left.length - right.length : 0;
  const groups = [...left, ...Array(Math.max(0, missing)).fill('0'), ...right];
  if (groups.length !== 8) return null;
  const words = groups.map((group) => Number.parseInt(group || '0', 16));
  if (words.some((word) => !Number.isInteger(word) || word < 0 || word > 0xffff)) return null;
  return words.flatMap((word) => [word >> 8, word & 0xff]);
}

export function isPrivateOrReservedIp(address: string) {
  const family = isIP(address);
  if (family === 4) {
    const bytes = ipv4Bytes(address)!;
    const [a, b, c] = bytes;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b! >= 64 && b! <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a! >= 224
    );
  }
  if (family !== 6) return true;
  const bytes = ipv6Bytes(address);
  if (!bytes) return true;
  const allZero = bytes.every((byte) => byte === 0);
  const loopback = bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1;
  const mappedV4 = bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (mappedV4) return isPrivateOrReservedIp(bytes.slice(12).join('.'));
  return (
    allZero ||
    loopback ||
    (bytes[0]! & 0xfe) === 0xfc ||
    (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80) ||
    (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0xc0) ||
    bytes[0] === 0xff ||
    (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) ||
    (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0 && bytes[3] === 0) ||
    (bytes[0] === 0x20 && bytes[1] === 0x02) ||
    (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b) ||
    (bytes[0] === 0x01 && bytes.slice(1, 8).every((byte) => byte === 0))
  );
}

export async function resolvePublicTarget(input: string, resolver: DnsResolver = defaultResolver) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new MetadataFetchError('Enter a valid absolute URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new MetadataFetchError('Only public HTTP and HTTPS URLs are allowed.');
  }
  if (url.username || url.password) {
    throw new MetadataFetchError('URLs containing credentials are not allowed.');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.home.arpa') ||
    hostname.endsWith('.test') ||
    hostname.endsWith('.example') ||
    hostname.endsWith('.invalid')
  ) {
    throw new MetadataFetchError('Local and reserved hostnames are not allowed.');
  }

  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await resolver(hostname).catch(() => {
        throw new MetadataFetchError('The hostname could not be resolved.');
      });
  if (!addresses.length) throw new MetadataFetchError('The hostname returned no addresses.');
  if (addresses.some(({ address }) => isPrivateOrReservedIp(address))) {
    throw new MetadataFetchError('Private or reserved network addresses are not allowed.');
  }
  return { url, address: addresses[0]!.address, family: addresses[0]!.family };
}

function decodeEntities(value: string) {
  const named: Record<string, string> = {
    amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1]?.toLowerCase() === 'x'
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function cleanText(value: string) {
  return decodeEntities(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function tagAttributes(tag: string) {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of tag.matchAll(pattern)) {
    const key = match[1]?.toLowerCase();
    if (key && key !== 'meta' && key !== 'link' && key !== 'script') {
      attributes[key] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
    }
  }
  return attributes;
}

function absoluteHttpUrl(value: unknown, baseUrl: string) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim(), baseUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function findJsonLdProduct(values: unknown[]): Record<string, unknown> | null {
  const queue = [...values];
  while (queue.length) {
    const value = queue.shift();
    if (Array.isArray(value)) {
      queue.push(...value);
      continue;
    }
    if (!value || typeof value !== 'object') continue;
    const object = value as Record<string, unknown>;
    const types = Array.isArray(object['@type']) ? object['@type'] : [object['@type']];
    if (types.some((type) => typeof type === 'string' && type.toLowerCase() === 'product')) return object;
    if (Array.isArray(object['@graph'])) queue.push(...object['@graph']);
  }
  return null;
}

function objectName(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as Record<string, unknown>).name === 'string') {
    return (value as Record<string, string>).name;
  }
  return null;
}

function firstString(value: unknown) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.find((candidate) => typeof candidate === 'string') ?? null;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return typeof object.url === 'string' ? object.url : typeof object.contentUrl === 'string' ? object.contentUrl : null;
  }
  return null;
}

export function extractPageMetadata(
  html: string,
  finalUrl: string,
  responseMetadata: Record<string, Json> = {},
): ExtractedPageMetadata {
  const meta: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = tagAttributes(tag);
    const key = (attributes.property ?? attributes.name ?? attributes.itemprop)?.toLowerCase();
    if (key && attributes.content && !(key in meta)) meta[key] = cleanText(attributes.content);
  }

  const links: Record<string, string> = {};
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attributes = tagAttributes(tag);
    const rel = attributes.rel?.toLowerCase();
    if (rel && attributes.href && !(rel in links)) links[rel] = attributes.href;
  }

  const jsonLd: unknown[] = [];
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    const attributes = tagAttributes(`<script ${match[1] ?? ''}>`);
    if (attributes.type?.toLowerCase() !== 'application/ld+json') continue;
    const body = (match[2] ?? '').trim();
    if (!body || body.length > 200_000 || jsonLd.length >= 20) continue;
    try {
      jsonLd.push(JSON.parse(body));
    } catch {
      // Invalid third-party JSON-LD is retained only as a warning count below.
    }
  }
  const product = findJsonLdProduct(jsonLd);
  const offerValue = Array.isArray(product?.offers) ? product?.offers[0] : product?.offers;
  const offer = offerValue && typeof offerValue === 'object' ? offerValue as Record<string, unknown> : null;
  const jsonPrice = offer?.price ?? offer?.lowPrice;
  const amountText = meta['product:price:amount'] ?? (jsonPrice === undefined ? '' : String(jsonPrice));
  const amount = amountText ? Number(amountText.replace(/[^0-9.,-]/g, '').replace(',', '.')) : NaN;
  const currency = (meta['product:price:currency'] ?? (typeof offer?.priceCurrency === 'string' ? offer.priceCurrency : '')).toUpperCase();
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const documentTitle = titleMatch ? cleanText(titleMatch[1] ?? '') : '';
  const ogTitle = meta['og:title'] || null;
  const productTitle = typeof product?.name === 'string' ? cleanText(product.name) : '';
  const imageCandidate =
    meta['og:image:secure_url'] ??
    meta['og:image'] ??
    meta['twitter:image'] ??
    meta.image ??
    links.image_src ??
    firstString(product?.image);
  const canonicalCandidate = links.canonical ?? finalUrl;
  const domain = new URL(finalUrl).hostname;
  const creator = objectName(product?.brand) ?? objectName(product?.manufacturer) ?? meta.author ?? null;

  return {
    requestedUrl: finalUrl,
    finalUrl,
    canonicalUrl: absoluteHttpUrl(canonicalCandidate, finalUrl) ?? finalUrl,
    title: ogTitle || productTitle || documentTitle || domain,
    ogTitle,
    description: meta['og:description'] ?? meta.description ?? null,
    imageUrl: absoluteHttpUrl(imageCandidate, finalUrl),
    siteName: meta['og:site_name'] || domain,
    domain,
    creator,
    priceAmount: Number.isFinite(amount) && amount >= 0 && /^[A-Z]{3}$/.test(currency) ? amount : null,
    priceCurrency: Number.isFinite(amount) && amount >= 0 && /^[A-Z]{3}$/.test(currency) ? currency : null,
    raw: {
      response: responseMetadata,
      meta,
      links,
      json_ld: jsonLd as Json,
    },
  };
}

async function readHtml(response: IncomingMessage, maxBytes: number) {
  const contentLength = Number(response.headers['content-length'] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    response.destroy();
    throw new MetadataFetchError(`The page exceeds the ${maxBytes}-byte response limit.`);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      response.destroy();
      throw new MetadataFetchError(`The page exceeds the ${maxBytes}-byte response limit.`);
    }
    chunks.push(buffer);
  }
  const body = Buffer.concat(chunks);
  const contentType = String(response.headers['content-type'] ?? 'text/html');
  const charset = contentType.match(/charset\s*=\s*([^;\s]+)/i)?.[1]?.replace(/["']/g, '') ?? 'utf-8';
  try {
    return { html: new TextDecoder(charset).decode(body), bytes: size, contentType };
  } catch {
    return { html: body.toString('utf8'), bytes: size, contentType };
  }
}

async function requestPinnedPage(
  target: Awaited<ReturnType<typeof resolvePublicTarget>>,
  timeoutMs: number,
  maxBytes: number,
) {
  const transport = target.url.protocol === 'https:' ? httpsRequest : httpRequest;
  let request: ClientRequest | null = null;
  let deadline: ReturnType<typeof setTimeout> | null = null;
  try {
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      request = transport(
        target.url,
        {
          method: 'GET',
          headers: {
            Accept: 'text/html,application/xhtml+xml;q=0.9',
            'Accept-Encoding': 'identity',
            'User-Agent': 'VisualSliderMetadataFetcher/1.0',
          },
          lookup: (_hostname, options, callback) => {
            if (typeof options === 'object' && options.all) {
              callback(null, [{ address: target.address, family: target.family }]);
            } else {
              callback(null, target.address, target.family);
            }
          },
        },
        resolve,
      );
      deadline = setTimeout(
        () => request?.destroy(new MetadataFetchError('Metadata fetch timed out.')),
        timeoutMs,
      );
      request.on('error', reject);
      request.end();
    });

    const status = response.statusCode ?? 0;
    if ([301, 302, 303, 307, 308].includes(status)) {
      const location = response.headers.location;
      response.destroy();
      if (!location) throw new MetadataFetchError('The page returned a redirect without a location.');
      return { redirect: new URL(location, target.url).toString(), response: null };
    }
    if (status < 200 || status >= 300) {
      response.destroy();
      throw new MetadataFetchError(`The page returned HTTP ${status}; protected or unavailable pages are not analyzed.`);
    }
    const encoding = String(response.headers['content-encoding'] ?? 'identity').toLowerCase();
    if (encoding !== 'identity') {
      response.destroy();
      throw new MetadataFetchError('Compressed metadata responses are not accepted.');
    }
    const body = await readHtml(response, maxBytes);
    if (!body.contentType.toLowerCase().includes('html')) {
      throw new MetadataFetchError(`Expected an HTML page but received ${body.contentType}.`);
    }
    return {
      redirect: null,
      response: {
        ...body,
        status,
        finalUrl: target.url.toString(),
      },
    };
  } finally {
    if (deadline) clearTimeout(deadline);
  }
}

export async function fetchPageMetadata(
  input: string,
  options: {
    resolver?: DnsResolver;
    timeoutMs?: number;
    maxBytes?: number;
  } = {},
) {
  const resolver = options.resolver ?? defaultResolver;
  let currentUrl = input;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const target = await resolvePublicTarget(currentUrl, resolver);
    const result = await requestPinnedPage(
      target,
      options.timeoutMs ?? METADATA_TIMEOUT_MS,
      options.maxBytes ?? METADATA_MAX_BYTES,
    );
    if (result.redirect) {
      if (redirectCount === MAX_REDIRECTS) throw new MetadataFetchError('The page redirected too many times.');
      currentUrl = result.redirect;
      continue;
    }
    const page = result.response!;
    const extracted = extractPageMetadata(page.html, page.finalUrl, {
      status: page.status,
      content_type: page.contentType,
      bytes: page.bytes,
      fetched_url: page.finalUrl,
      redirect_count: redirectCount,
    });
    extracted.requestedUrl = input;

    try {
      await resolvePublicTarget(extracted.canonicalUrl, resolver);
    } catch {
      extracted.canonicalUrl = page.finalUrl;
    }
    if (extracted.imageUrl) {
      try {
        await resolvePublicTarget(extracted.imageUrl, resolver);
      } catch {
        extracted.imageUrl = null;
      }
    }
    return extracted;
  }
  throw new MetadataFetchError('The page could not be fetched.');
}
