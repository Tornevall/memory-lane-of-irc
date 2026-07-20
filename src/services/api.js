import { updateBackendAuthModeFromHeaders } from './authMode';

const TARGET_BASES = {
  prod: 'https://tools.tornevall.net',
  test: 'https://tools.tornevall.com',
};

function normalizeBaseUrl(raw) {
  const base = String(raw || '').trim();
  if (!base) return '';
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

function resolveApiBaseUrl() {
  const explicit = normalizeBaseUrl(import.meta.env.VITE_API_URL);
  if (explicit) {
    return explicit;
  }

  const target = String(import.meta.env.VITE_API_TARGET || '').trim().toLowerCase();
  if (target && TARGET_BASES[target]) {
    return TARGET_BASES[target];
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    const host = String(window.location.hostname || '').toLowerCase();
    if (host === 'tools.tornevall.com' || host === 'tools.tornevall.net') {
      return normalizeBaseUrl(window.location.origin);
    }
  }

  return TARGET_BASES.prod;
}

const BASE_URL = resolveApiBaseUrl();

export function getApiBaseUrl() {
  return BASE_URL;
}

export function getPermalinkUrl(permalink) {
  if (!permalink) return '';
  if (/^https?:\/\//i.test(permalink)) {
    return permalink;
  }
  return new URL(permalink, `${BASE_URL}/`).toString();
}

function getHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

function extractErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload;
  if (typeof payload.message === 'string') return payload.message;
  if (typeof payload.error === 'string') return payload.error;
  if (payload.error && typeof payload.error.message === 'string') return payload.error.message;
  return fallback;
}

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchWithFallback(apiKey, paths, init = {}, fallbackError = 'Request failed') {
  let lastStatus = null;
  for (let i = 0; i < paths.length; i += 1) {
    const res = await fetch(`${BASE_URL}${paths[i]}`, {
      ...init,
      headers: {
        ...getHeaders(apiKey),
        ...(init.headers || {}),
      },
      signal: init.signal || AbortSignal.timeout(30000),
    });
    updateBackendAuthModeFromHeaders(res.headers);
    const data = await parseJsonSafe(res);
    if (res.ok) {
      return data;
    }
    lastStatus = res.status;
    // Try fallback only on not-found style mismatches.
    if (res.status !== 404 || i === paths.length - 1) {
      throw new Error(extractErrorMessage(data, `${fallbackError} (${res.status})`));
    }
  }
  throw new Error(`${fallbackError}${lastStatus ? ` (${lastStatus})` : ''}`);
}

export async function simpleSearch(apiKey, query, channelId, networkId) {
  const params = new URLSearchParams({ q: query });
  if (networkId) params.append('network_id', networkId);
  if (channelId) params.append('channel_id', channelId);
  const data = await fetchWithFallback(
    apiKey,
    [`/api/irclog/search?${params}`],
    {},
    'Search failed'
  );
  return data || {};
}

export async function advancedSearch(apiKey, body) {
  const data = await fetchWithFallback(
    apiKey,
    ['/api/irclog/search'],
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    'Search failed'
  );
  return data || {};
}

export async function getHighlights(apiKey) {
  const data = await fetchWithFallback(
    apiKey,
    ['/api/irclog/highlights'],
    {},
    'Failed to fetch highlights'
  );
  return data || {};
}

export async function createHighlight(apiKey, body) {
  const data = await fetchWithFallback(
    apiKey,
    ['/api/irclog/highlights'],
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    'Failed to create highlight'
  );
  return data || {};
}

export async function getNetworks(apiKey) {
  const data = await fetchWithFallback(
    apiKey,
    ['/api/irclog/networks', '/irc/api/networks'],
    {},
    'Failed to fetch networks'
  );
  return data || {};
}

export async function getNetworkChannels(apiKey, networkId) {
  const data = await fetchWithFallback(
    apiKey,
    [`/api/irclog/networks/${networkId}/channels`, `/irc/api/networks/${networkId}/channels`],
    {},
    'Failed to fetch channels'
  );
  return data || {};
}
