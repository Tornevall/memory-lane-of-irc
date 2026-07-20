import { updateBackendAuthModeFromHeaders } from './authMode';

// Configurable API base URL
// Production: tools.tornevall.net
// Staging: tools.tornevall.com
// Can be overridden via environment variable: VITE_API_URL
const BASE_URL = import.meta.env.VITE_API_URL || 'https://tools.tornevall.net';

function getHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

export async function simpleSearch(apiKey, query, channelId, networkId) {
  const params = new URLSearchParams({ q: query });
  if (networkId) params.append('network_id', networkId);
  if (channelId) params.append('channel_id', channelId);
  const res = await fetch(`${BASE_URL}/api/irclog/search?${params}`, {
    headers: getHeaders(apiKey),
    signal: AbortSignal.timeout(30000),
  });
  updateBackendAuthModeFromHeaders(res.headers);
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
  updateBackendAuthModeFromHeaders(res.headers);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Search failed');
  return data;
}

export async function getHighlights(apiKey) {
  const res = await fetch(`${BASE_URL}/api/irclog/highlights`, {
    headers: getHeaders(apiKey),
    signal: AbortSignal.timeout(30000),
  });
  updateBackendAuthModeFromHeaders(res.headers);
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
  updateBackendAuthModeFromHeaders(res.headers);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create highlight');
  return data;
}

export async function getNetworks(apiKey) {
  const res = await fetch(`${BASE_URL}/api/irclog/networks`, {
    headers: getHeaders(apiKey),
    signal: AbortSignal.timeout(30000),
  });
  updateBackendAuthModeFromHeaders(res.headers);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch networks');
  return data;
}

export async function getNetworkChannels(apiKey, networkId) {
  const res = await fetch(`${BASE_URL}/api/irclog/networks/${networkId}/channels`, {
    headers: getHeaders(apiKey),
    signal: AbortSignal.timeout(30000),
  });
  updateBackendAuthModeFromHeaders(res.headers);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch channels');
  return data;
}
