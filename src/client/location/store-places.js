import { normalizeCoordinate } from './distance.js';
import { dedupeAndSortPlaces, normalizePlace } from './store-place.js';

const STORE_FIELDS = ['id', 'displayName', 'formattedAddress', 'location', 'businessStatus'];

function clean(value) {
  return String(value ?? '').trim();
}

function suggestionLabel(prediction) {
  const text = prediction?.text;
  if (typeof text === 'string') return clean(text);
  if (typeof text?.toString === 'function') return clean(text.toString());
  return clean(prediction?.mainText?.text || prediction?.mainText);
}

export async function fetchStoreSuggestions({
  input,
  origin,
  placesLibrary,
  sessionToken
} = {}) {
  const query = clean(input);
  if (!query) return [];
  const AutocompleteSuggestion = placesLibrary?.AutocompleteSuggestion;
  if (typeof AutocompleteSuggestion?.fetchAutocompleteSuggestions !== 'function') {
    throw new Error('Google Places 自動完成目前無法使用。');
  }
  const normalizedOrigin = normalizeCoordinate(origin);
  const request = {
    input: query,
    language: 'zh-TW'
  };
  if (normalizedOrigin) request.origin = normalizedOrigin;
  if (sessionToken) request.sessionToken = sessionToken;
  const { suggestions = [] } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
  return suggestions
    .map((suggestion) => suggestion?.placePrediction)
    .filter(Boolean)
    .map((prediction) => ({ label: suggestionLabel(prediction), prediction }))
    .filter((entry) => entry.label);
}

export async function resolveStoreSuggestion({ prediction } = {}) {
  if (!prediction || typeof prediction.toPlace !== 'function') return null;
  const place = prediction.toPlace();
  if (!place || typeof place.fetchFields !== 'function') return null;
  await place.fetchFields({ fields: STORE_FIELDS });
  return normalizePlace(place);
}

export async function searchStoresByText({ query, origin, placesLibrary, maxResultCount = 20 } = {}) {
  const textQuery = clean(query);
  if (!textQuery) return [];
  const Place = placesLibrary?.Place;
  if (typeof Place?.searchByText !== 'function') throw new Error('Google Places 分店搜尋目前無法使用。');
  const normalizedOrigin = normalizeCoordinate(origin);
  const request = {
    textQuery,
    fields: STORE_FIELDS,
    maxResultCount: Math.max(1, Math.min(20, Number(maxResultCount) || 20)),
    language: 'zh-TW'
  };
  if (normalizedOrigin) request.locationBias = normalizedOrigin;
  const { places = [] } = await Place.searchByText(request);
  return dedupeAndSortPlaces(places, normalizedOrigin);
}

export async function resolveAddressPlace({ address, country = '', placesLibrary } = {}) {
  const text = [clean(address), clean(country)].filter(Boolean).join(' ');
  if (!text) return null;
  const Place = placesLibrary?.Place;
  if (typeof Place?.searchByText !== 'function') throw new Error('Google Places 地址解析目前無法使用。');
  const { places = [] } = await Place.searchByText({
    textQuery: text,
    fields: STORE_FIELDS,
    maxResultCount: 1,
    language: 'zh-TW'
  });
  return dedupeAndSortPlaces(places)[0] || null;
}

export const storePlaceFields = [...STORE_FIELDS];
