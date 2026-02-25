const BASE_URL = 'https://tools.tornevall.com';

function getHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

/**
 * Returns the effective API key: localStorage value first, then the
 * VITE_API_TOKEN env var (set in .env), then empty string.
 */
export function getEffectiveApiKey() {
  return localStorage.getItem('irc_api_key')
    || import.meta.env.VITE_API_TOKEN
    || '';
}

export async function simpleSearch(apiKey, query, channelId) {
  const params = new URLSearchParams({ q: query });
  if (channelId) params.append('channel_id', channelId);
  const res = await fetch(`${BASE_URL}/api/irclog/search?${params}`, {
    headers: getHeaders(apiKey),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Search failed');
  return data;
}

export async function advancedSearch(apiKey, body) {
  const res = await fetch(`${BASE_URL}/api/irclog/search`, {
    method: 'POST',
    headers: getHeaders(apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Search failed');
  return data;
}

export async function getHighlights(apiKey) {
  const res = await fetch(`${BASE_URL}/api/irclog/highlights`, {
    headers: getHeaders(apiKey),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch highlights');
  return data;
}

export async function createHighlight(apiKey, body) {
  const res = await fetch(`${BASE_URL}/api/irclog/highlights`, {
    method: 'POST',
    headers: getHeaders(apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create highlight');
  return data;
}
