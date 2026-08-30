import type { AdminCategory, AdminItemInput, PublicationStatus } from './types';

const publicationStatuses = new Set<PublicationStatus>([
  'draft',
  'review',
  'published',
  'rejected',
  'archived',
]);

export class AdminFormError extends Error {}

function requiredText(formData: FormData, name: string, label: string) {
  const value = String(formData.get(name) ?? '').trim();
  if (!value) throw new AdminFormError(`${label} is required.`);
  return value;
}

function normalizedHttpUrl(value: string, label: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AdminFormError(`${label} must be a valid URL.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AdminFormError(`${label} must use HTTP or HTTPS.`);
  }
  url.hash = '';
  return url.toString();
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).origin !== new URL(request.url).origin) {
    throw new AdminFormError('The form origin could not be verified. Reload the page and try again.');
  }
}

export function parseAdminItemForm(formData: FormData, categories: AdminCategory[]): AdminItemInput {
  const categoryId = requiredText(formData, 'categoryId', 'Category');
  const category = categories.find((candidate) => candidate.id === categoryId);
  if (!category) throw new AdminFormError('Select a valid category.');

  const publicationStatus = requiredText(
    formData,
    'publicationStatus',
    'Publication status',
  ) as PublicationStatus;
  if (!publicationStatuses.has(publicationStatus)) {
    throw new AdminFormError('Select a valid publication status.');
  }

  const priceText = String(formData.get('priceAmount') ?? '').trim();
  const priceAmount = priceText ? Number(priceText) : null;
  if (priceAmount !== null && (!Number.isFinite(priceAmount) || priceAmount < 0)) {
    throw new AdminFormError('Price must be a positive number.');
  }

  const currencyText = String(formData.get('priceCurrency') ?? '').trim().toUpperCase();
  if (currencyText && !/^[A-Z]{3}$/.test(currencyText)) {
    throw new AdminFormError('Currency must be a three-letter code such as EUR.');
  }
  if (priceAmount !== null && !currencyText) {
    throw new AdminFormError('Currency is required when a price is provided.');
  }

  const attributeValues: Record<string, number> = {};
  for (const attribute of category.attributes.filter((candidate) => candidate.enabled)) {
    const rawValue = String(formData.get(`attribute:${attribute.id}`) ?? '').trim();
    if (!rawValue) throw new AdminFormError(`${attribute.label} is required.`);
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new AdminFormError(`${attribute.label} must be between 0 and 100.`);
    }
    attributeValues[attribute.id] = value;
  }

  const creator = String(formData.get('creator') ?? '').trim() || null;
  const sourceUrl = normalizedHttpUrl(requiredText(formData, 'sourceUrl', 'Source URL'), 'Source URL');
  const imageUrl = normalizedHttpUrl(requiredText(formData, 'imageUrl', 'Image URL'), 'Image URL');
  const priceCurrency = currencyText || null;

  return {
    categoryId,
    title: requiredText(formData, 'title', 'Title'),
    sourceUrl,
    imageUrl,
    creator,
    sourceSite: requiredText(formData, 'sourceSite', 'Source site'),
    priceAmount,
    priceCurrency,
    priceLabel:
      priceAmount === null || !priceCurrency
        ? null
        : `${priceCurrency} ${priceAmount.toFixed(2)}`,
    publicationStatus,
    attributeValues,
  };
}
