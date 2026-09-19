import { DEFAULT_COUNTRY, resolveItemCountry } from './travel-country.js';
import { createGoogleMapsUrl } from '../utils/url-utils.js';

export function resolveCardItemId({ dataset = {}, onclickSource = '' } = {}) {
  const enhanced = String(dataset?.enhancedItemId || '').trim();
  if (enhanced) return enhanced;
  const match = String(onclickSource || '').match(/openEditModal\(['"]([^'"]+)['"]\)/);
  return match?.[1] || '';
}

export function itemMatchesActiveCountry(item, activeCountry) {
  const country = String(activeCountry || '').trim() || DEFAULT_COUNTRY;
  return resolveItemCountry(item) === country;
}

export function shouldShowItemForCountry({ item, activeCountry, itemsLoaded } = {}) {
  if (!itemsLoaded || !item) return false;
  return itemMatchesActiveCountry(item, activeCountry);
}

export function createCountryMapsSearchUrl(location) {
  return createGoogleMapsUrl(location);
}

export async function initCountryIsolation() {
  if (typeof window === 'undefined') return;
  if (window.__shoppingListCountryIsolationInitialized) return;
  window.__shoppingListCountryIsolationInitialized = true;
}
