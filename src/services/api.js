import { updateBackendAuthModeFromHeaders } from './authMode';

const TARGET_BASES = {
  prod: 'https://tools.tornevall.net',
  test: 'https://tools.tornevall.com',
};
const TRUSTED_HOSTS = new Set(['tools.tornevall.com', 'tools.tornevall.net']);
const READ_SOURCE = String(import.meta.env.VITE_IRCLOG_READ_SOURCE || 'production').trim().toLowerCase() === 'sandbox'
  ? 'sandbox'
  : 'production';

function normalizeBaseUrl(raw) {
  const base = String(raw || '').trim();
  if (!base) return '';
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

function resolveApiBaseUrl() {
  const browserHost = typeof window !== 'undefined' ? String(window.location?.hostname || '').toLowerCase() : '';
  const browserOrigin = typeof window !== 'undefined' ? normalizeBaseUrl(window.location?.origin) : '';
  const explicit = normalizeBaseUrl(import.meta.env.VITE_API_URL);
  if (explicit) {
    // Guard against stale env where .net build accidentally points to .com (or vice versa),
    // which causes CORS/preflight failures for API calls.
    if (browserOrigin && TRUSTED_HOSTS.has(browserHost)) {
      try {
        const explicitHost = String(new URL(explicit).hostname || '').toLowerCase();
        if (TRUSTED_HOSTS.has(explicitHost) && explicitHost !== browserHost) {
          return browserOrigin;
        }
      } catch {
        // Keep explicit URL if it is not a valid absolute URL.
      }
    }
    return explicit;
  }

  const target = String(import.meta.env.VITE_API_TARGET || '').trim().toLowerCase();
  if (target && TARGET_BASES[target]) {
    return TARGET_BASES[target];
  }

  if (browserOrigin && TRUSTED_HOSTS.has(browserHost)) {
    return browserOrigin;
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
  return fetchWithFallbackByStatus(apiKey, paths, init, fallbackError, [404]);
}

async function fetchWithFallbackByStatus(apiKey, paths, init = {}, fallbackError = 'Request failed', fallbackStatuses = [404]) {
  let lastStatus = null;
  const fallbackStatusSet = new Set(fallbackStatuses);
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
    if (!fallbackStatusSet.has(res.status) || i === paths.length - 1) {
      throw new Error(extractErrorMessage(data, `${fallbackError} (${res.status})`));
    }
  }
  throw new Error(`${fallbackError}${lastStatus ? ` (${lastStatus})` : ''}`);
}

function appendIfPresent(params, key, value) {
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized !== null && normalized !== undefined && normalized !== '') {
    params.append(key, String(normalized));
  }

  function appendReadSource(params) {
    appendIfPresent(params, 'source', READ_SOURCE);
  }
}

function extractResultArray(payload) {
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

async function fetchLogQuery(apiKey, params, fallbackError) {
  appendReadSource(params);
  const queryString = params.toString();
  const suffix = queryString ? `?${queryString}` : '';
  return fetchWithFallbackByStatus(
    apiKey,
    [`/irc/api/logs${suffix}`, `/api/irclog/search${suffix}`],
    {},
    fallbackError,
    [404, 500, 502, 503]
  );
}

export async function simpleSearch(apiKey, query, channelId, networkId, date = '') {
  const params = new URLSearchParams();
  appendIfPresent(params, 'q', query);
  appendIfPresent(params, 'network_id', networkId);
  appendIfPresent(params, 'channel_id', channelId);
  appendIfPresent(params, 'date', date);
  const data = await fetchLogQuery(apiKey, params, 'Search failed');
  return data || {};
}

export async function advancedSearch(apiKey, body) {
  const requestBody = { ...body, source: READ_SOURCE };
  const data = await fetchWithFallback(
    apiKey,
    ['/api/irclog/search'],
    {
      method: 'POST',
      body: JSON.stringify(requestBody),
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
  const params = new URLSearchParams();
  appendReadSource(params);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const data = await fetchWithFallback(
    apiKey,
    [`/irc/api/networks${suffix}`, `/api/irclog/networks${suffix}`, `/irclog/networks${suffix}`],
    {},
    'Failed to fetch networks'
  );
  return data || {};
}

export async function getNetworkChannels(apiKey, networkId) {
  const params = new URLSearchParams();
  appendReadSource(params);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const data = await fetchWithFallback(
    apiKey,
    [
      `/irc/api/networks/${networkId}/channels${suffix}`,
      `/api/irclog/networks/${networkId}/channels${suffix}`,
      `/irclog/networks/${networkId}/channels${suffix}`,
    ],
    {},
    'Failed to fetch channels'
  );
  return data || {};
}

function toIsoDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export async function getChannelDateRange(apiKey, networkId, channelId) {
  if (!channelId) {
    return { firstDate: '', lastDate: '', total: 0 };
  }

  export function getReadSource() {
    return READ_SOURCE;
  }

  const firstParams = new URLSearchParams();
  appendIfPresent(firstParams, 'network_id', networkId);
  appendIfPresent(firstParams, 'channel_id', channelId);
  firstParams.append('limit', '1');
  firstParams.append('offset', '0');

  const firstPayload = await fetchLogQuery(apiKey, firstParams, 'Failed to fetch channel date range');
  const firstResults = extractResultArray(firstPayload);
  const total = Number(firstPayload?.total ?? firstResults.length ?? 0);
  const firstDate = toIsoDate(firstResults[0]?.occurred_at || firstResults[0]?.date || firstResults[0]?.created_at);

  if (total <= 1) {
    return { firstDate, lastDate: firstDate, total };
  }

  const lastParams = new URLSearchParams();
  appendIfPresent(lastParams, 'network_id', networkId);
  appendIfPresent(lastParams, 'channel_id', channelId);
  lastParams.append('limit', '1');
  lastParams.append('offset', String(Math.max(total - 1, 0)));

  const lastPayload = await fetchLogQuery(apiKey, lastParams, 'Failed to fetch channel date range');
  const lastResults = extractResultArray(lastPayload);
  const lastDate = toIsoDate(lastResults[0]?.occurred_at || lastResults[0]?.date || lastResults[0]?.created_at);

  return {
    firstDate,
    lastDate: lastDate || firstDate,
    total,
  };
}
