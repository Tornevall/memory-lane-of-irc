import { updateBackendAuthModeFromHeaders } from './authMode';

const TARGET_BASES = {
  prod: 'https://tools.tornevall.net',
  test: 'https://tools.tornevall.com',
};
const TRUSTED_HOSTS = new Set([
  'tools.tornevall.com',
  'tools.tornevall.net',
]);
const READ_SOURCE = String(import.meta.env.VITE_IRCLOG_READ_SOURCE || 'production').trim().toLowerCase() === 'sandbox'
  ? 'sandbox'
  : 'production';

function normalizeBaseUrl(raw) {
  const base = String(raw || '').trim();
  if (!base) return '';
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

function isTrustedTornevallHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  return TRUSTED_HOSTS.has(host);
}

function resolveApiBaseUrl() {
  const browserHost = typeof window !== 'undefined' ? String(window.location?.hostname || '').toLowerCase() : '';
  const browserOrigin = typeof window !== 'undefined' ? normalizeBaseUrl(window.location?.origin) : '';
  const explicit = normalizeBaseUrl(import.meta.env.VITE_API_URL);
  if (explicit) {
    return explicit;
  }

  const target = String(import.meta.env.VITE_API_TARGET || '').trim().toLowerCase();
  if (target && TARGET_BASES[target]) {
    return TARGET_BASES[target];
  }

  if (browserOrigin && isTrustedTornevallHost(browserHost)) {
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

function getHeaders(apiKey, options = {}) {
  const includeContentType = options.includeContentType !== false;
  const includeAuth = options.includeAuth === true;
  return {
    ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
    ...(includeAuth && apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
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

async function fetchWithFallback(apiKey, paths, init = {}, fallbackError = 'Request failed', options = {}) {
  return fetchWithFallbackByStatus(apiKey, paths, init, fallbackError, [404], options);
}

async function fetchWithFallbackByStatus(apiKey, paths, init = {}, fallbackError = 'Request failed', fallbackStatuses = [404], options = {}) {
  let lastStatus = null;
  const fallbackStatusSet = new Set(fallbackStatuses);
  const hasBody = typeof init.body !== 'undefined' && init.body !== null;
  const headers = getHeaders(apiKey, {
    includeContentType: hasBody,
    includeAuth: options.includeAuth === true,
  });
  for (let i = 0; i < paths.length; i += 1) {
    let res;
    try {
      res = await fetch(`${BASE_URL}${paths[i]}`, {
        ...init,
        headers: {
          ...headers,
          ...(init.headers || {}),
        },
        signal: init.signal || AbortSignal.timeout(30000),
        redirect: init.redirect || 'manual',
      });
    } catch (error) {
      const networkMessage = String(error?.message || '').trim();
      if (i < paths.length - 1) {
        continue;
      }
      throw new Error(
        networkMessage || `Network error while calling ${BASE_URL}${paths[i]}. Check CORS/proxy and API base URL.`
      );
    }
    updateBackendAuthModeFromHeaders(res.headers);
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
      lastStatus = res.status || 302;
      if (i < paths.length - 1) {
        continue;
      }
      throw new Error(`${fallbackError} (${lastStatus})`);
    }
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
}

function appendReadSource(params) {
  appendIfPresent(params, 'source', READ_SOURCE);
}

function normalizeDateTimeParam(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.includes('T') ? raw.replace('T', ' ') : raw;
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(normalized)) {
    return `${normalized}:00`;
  }
  return normalized;
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
    [`/irc/api/logs${suffix}`],
    {},
    fallbackError,
    [404],
    { includeAuth: false }
  );
}

export async function simpleSearch(apiKey, query, channelId, networkId, dateFrom = '', dateTo = '') {
  const normalizedDateFrom = normalizeDateTimeParam(dateFrom);
  const normalizedDateTo = normalizeDateTimeParam(dateTo);
  const params = new URLSearchParams();
  appendIfPresent(params, 'q', query);
  appendIfPresent(params, 'network_id', networkId);
  appendIfPresent(params, 'channel_id', channelId);
  appendIfPresent(params, 'datetime_from', normalizedDateFrom);
  appendIfPresent(params, 'datetime_to', normalizedDateTo);
  const dateOnlyFrom = normalizedDateFrom ? normalizedDateFrom.slice(0, 10) : '';
  const dateOnlyTo = normalizedDateTo ? normalizedDateTo.slice(0, 10) : '';
  appendIfPresent(params, 'date_from', dateOnlyFrom);
  appendIfPresent(params, 'date_to', dateOnlyTo);
  if (dateOnlyFrom && dateOnlyTo && dateOnlyFrom === dateOnlyTo) {
    appendIfPresent(params, 'date', dateOnlyFrom);
  }
  const data = await fetchLogQuery(apiKey, params, 'Search failed');
  return data || {};
}

export async function advancedSearch(apiKey, body) {
  const params = new URLSearchParams();
  appendIfPresent(params, 'q', body?.query);
  appendIfPresent(params, 'network_id', body?.network_id);
  appendIfPresent(params, 'channel_id', body?.channel_id);
  appendIfPresent(params, 'nick', body?.nick);
  appendIfPresent(params, 'date_from', body?.date_from);
  appendIfPresent(params, 'date_to', body?.date_to);
  appendIfPresent(params, 'limit', body?.limit);
  appendIfPresent(params, 'page', body?.page);
  const data = await fetchLogQuery(apiKey, params, 'Search failed');
  return data || {};
}

export async function getHighlights(apiKey) {
  const data = await fetchWithFallback(
    apiKey,
    ['/api/irclog/highlights'],
    {},
    'Failed to fetch highlights',
    { includeAuth: true }
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
    'Failed to create highlight',
    { includeAuth: true }
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
    'Failed to fetch networks',
    { includeAuth: false }
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
    'Failed to fetch channels',
    { includeAuth: false }
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

export function getReadSource() {
  return READ_SOURCE;
}
