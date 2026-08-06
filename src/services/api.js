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
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const LOG_QUERY_TIMEOUT_MS = 120000;
const STATS_CHUNK_TRIGGER_DAYS = resolvePositiveEnvInt(import.meta.env.VITE_IRC_STATS_CHUNK_TRIGGER_DAYS, 45);
const STATS_CHUNK_SIZE_DAYS = resolvePositiveEnvInt(import.meta.env.VITE_IRC_STATS_CHUNK_SIZE_DAYS, 14);
const STATS_CHUNK_MAX_WINDOWS = resolvePositiveEnvInt(import.meta.env.VITE_IRC_STATS_CHUNK_MAX_WINDOWS, 48);
const STATS_CHUNK_CONCURRENCY = Math.max(1, Math.min(resolvePositiveEnvInt(import.meta.env.VITE_IRC_STATS_CHUNK_CONCURRENCY, 2), 6));

function resolvePositiveEnvInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

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
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0
    ? Number(options.timeoutMs)
    : DEFAULT_REQUEST_TIMEOUT_MS;
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
        signal: init.signal || AbortSignal.timeout(timeoutMs),
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

function toPositiveInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function appendPagination(params, limit, page) {
  const normalizedLimit = toPositiveInt(limit, 0);
  if (normalizedLimit > 0) {
    params.append('limit', String(normalizedLimit));
  }
  const normalizedPage = toPositiveInt(page, 1);
  const offset = normalizedLimit > 0 ? Math.max(0, (normalizedPage - 1) * normalizedLimit) : 0;
  params.append('offset', String(offset));
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
    { includeAuth: false, timeoutMs: LOG_QUERY_TIMEOUT_MS }
  );
}

function normalizeDateOnlyParam(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return '';
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(check.getTime())
    || check.getUTCFullYear() !== year
    || (check.getUTCMonth() + 1) !== month
    || check.getUTCDate() !== day
  ) {
    return '';
  }
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function toDaySerial(dateValue) {
  const normalized = normalizeDateOnlyParam(dateValue);
  if (!normalized) return null;
  const [year, month, day] = normalized.split('-').map((part) => Number(part));
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function fromDaySerial(serial) {
  const d = new Date(Number(serial) * 86400000);
  return `${d.getUTCFullYear().toString().padStart(4, '0')}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}`;
}

function extractDatePart(value) {
  const normalized = normalizeDateTimeParam(value);
  if (!normalized) return '';
  return normalizeDateOnlyParam(normalized.slice(0, 10));
}

function buildStatsParams(body = {}) {
  const params = new URLSearchParams();
  params.set('aggregate', 'stats');
  appendIfPresent(params, 'q', body?.query);
  appendIfPresent(params, 'include_terms', body?.include_terms);
  appendIfPresent(params, 'exclude_terms', body?.exclude_terms);
  appendIfPresent(params, 'network_id', body?.network_id);
  appendIfPresent(params, 'channel_id', body?.channel_id);
  appendIfPresent(params, 'event_types', body?.event_types);
  appendIfPresent(params, 'date_from', body?.date_from);
  appendIfPresent(params, 'date_to', body?.date_to);
  appendIfPresent(params, 'datetime_from', normalizeDateTimeParam(body?.datetime_from));
  appendIfPresent(params, 'datetime_to', normalizeDateTimeParam(body?.datetime_to));
  if (typeof body?.include_daily_top_nicks === 'boolean') {
    params.set('include_daily_top_nicks', body.include_daily_top_nicks ? '1' : '0');
  }
  appendIfPresent(params, 'channel_password', body?.channel_password);
  return params;
}

async function fetchStatsPayload(apiKey, body = {}) {
  const params = buildStatsParams(body);
  const data = await fetchLogQuery(apiKey, params, 'Statistics failed');
  return data || {};
}

function buildStatsDateChunks(body = {}) {
  const normalizedDateTimeFrom = normalizeDateTimeParam(body?.datetime_from);
  const normalizedDateTimeTo = normalizeDateTimeParam(body?.datetime_to);
  const fromDate = extractDatePart(normalizedDateTimeFrom || body?.date_from);
  const toDate = extractDatePart(normalizedDateTimeTo || body?.date_to);
  const fromSerial = toDaySerial(fromDate);
  const toSerial = toDaySerial(toDate);
  if (!Number.isInteger(fromSerial) || !Number.isInteger(toSerial)) {
    return [];
  }

  const startSerial = Math.min(fromSerial, toSerial);
  const endSerial = Math.max(fromSerial, toSerial);
  const spanDays = (endSerial - startSerial) + 1;
  if (spanDays <= STATS_CHUNK_TRIGGER_DAYS) {
    return [];
  }

  const adaptiveChunkSize = Math.max(
    STATS_CHUNK_SIZE_DAYS,
    Math.ceil(spanDays / Math.max(STATS_CHUNK_MAX_WINDOWS, 1))
  );
  const chunks = [];
  let cursor = startSerial;
  while (cursor <= endSerial) {
    const chunkEndSerial = Math.min(cursor + adaptiveChunkSize - 1, endSerial);
    const dateFrom = fromDaySerial(cursor);
    const dateTo = fromDaySerial(chunkEndSerial);
    chunks.push({
      date_from: dateFrom,
      date_to: dateTo,
      datetime_from: `${dateFrom} 00:00:00`,
      datetime_to: `${dateTo} 23:59:59`,
    });
    cursor = chunkEndSerial + 1;
  }
  if (chunks.length <= 1) {
    return [];
  }
  if (normalizedDateTimeFrom && chunks[0]) {
    chunks[0].datetime_from = normalizedDateTimeFrom;
  }
  if (normalizedDateTimeTo && chunks[chunks.length - 1]) {
    chunks[chunks.length - 1].datetime_to = normalizedDateTimeTo;
  }
  return chunks;
}

function toSafeInt(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed <= 0) return 0;
  return Math.floor(parsed);
}

function normalizeTimestamp(value) {
  const normalized = String(value || '').trim();
  return normalized || '';
}

function pickEarlierTimestamp(current, candidate) {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate < current ? candidate : current;
}

function pickLaterTimestamp(current, candidate) {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate > current ? candidate : current;
}

function mergeChunkedStatsPayload(chunks = [], includeDailyTopNicks = false, chunkProgress = null) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return {};
  }
  const basePayload = chunks[0] || {};
  let totalRows = 0;
  let chatRowsTotal = 0;
  let channelEventRowsTotal = 0;
  let firstOccurredAt = '';
  let lastOccurredAt = '';

  const eventTypeCountsMap = new Map();
  const topNickCountsMap = new Map();
  const dailyBreakdownMap = new Map();
  const dailyTopNickMap = new Map();

  chunks.forEach((chunk) => {
    totalRows += toSafeInt(chunk?.total_rows);
    chatRowsTotal += toSafeInt(chunk?.chat_rows_total);
    channelEventRowsTotal += toSafeInt(chunk?.channel_event_rows_total);
    firstOccurredAt = pickEarlierTimestamp(firstOccurredAt, normalizeTimestamp(chunk?.first_occurred_at));
    lastOccurredAt = pickLaterTimestamp(lastOccurredAt, normalizeTimestamp(chunk?.last_occurred_at));

    const eventTypeCounts = Array.isArray(chunk?.event_type_counts) ? chunk.event_type_counts : [];
    eventTypeCounts.forEach((row) => {
      const eventType = String(row?.event_type || '').trim().toUpperCase() || 'UNKNOWN';
      const nextValue = toSafeInt(row?.row_count);
      if (nextValue <= 0) return;
      eventTypeCountsMap.set(eventType, (eventTypeCountsMap.get(eventType) || 0) + nextValue);
    });

    const topNicks = Array.isArray(chunk?.top_nicks) ? chunk.top_nicks : [];
    topNicks.forEach((row) => {
      const nick = String(row?.nick || '').trim();
      const nextValue = toSafeInt(row?.row_count);
      if (!nick || nextValue <= 0) return;
      topNickCountsMap.set(nick, (topNickCountsMap.get(nick) || 0) + nextValue);
    });

    const breakdownRows = Array.isArray(chunk?.daily_breakdown) ? chunk.daily_breakdown : [];
    if (breakdownRows.length > 0) {
      breakdownRows.forEach((row) => {
        const dateKey = normalizeDateOnlyParam(row?.log_date);
        if (!dateKey) return;
        const current = dailyBreakdownMap.get(dateKey) || {
          total_rows: 0,
          chat_rows: 0,
          channel_event_rows: 0,
        };
        current.total_rows += toSafeInt(row?.total_rows ?? row?.row_count);
        current.chat_rows += toSafeInt(row?.chat_rows);
        current.channel_event_rows += toSafeInt(row?.channel_event_rows);
        dailyBreakdownMap.set(dateKey, current);
      });
    } else {
      const dailyRows = Array.isArray(chunk?.daily_counts) ? chunk.daily_counts : [];
      dailyRows.forEach((row) => {
        const dateKey = normalizeDateOnlyParam(row?.log_date);
        if (!dateKey) return;
        const current = dailyBreakdownMap.get(dateKey) || {
          total_rows: 0,
          chat_rows: 0,
          channel_event_rows: 0,
        };
        current.total_rows += toSafeInt(row?.total_rows ?? row?.row_count);
        dailyBreakdownMap.set(dateKey, current);
      });
    }

    if (includeDailyTopNicks) {
      const dailyTopNicks = Array.isArray(chunk?.daily_top_nicks) ? chunk.daily_top_nicks : [];
      dailyTopNicks.forEach((row) => {
        const dateKey = normalizeDateOnlyParam(row?.log_date);
        const nick = String(row?.nick || '').trim();
        const nextValue = toSafeInt(row?.row_count);
        if (!dateKey || !nick || nextValue <= 0) return;
        const mapKey = `${dateKey}\n${nick}`;
        dailyTopNickMap.set(mapKey, (dailyTopNickMap.get(mapKey) || 0) + nextValue);
      });
    }
  });

  const eventTypeCounts = Array.from(eventTypeCountsMap.entries())
    .map(([event_type, row_count]) => ({ event_type, row_count }))
    .sort((a, b) => (b.row_count - a.row_count) || a.event_type.localeCompare(b.event_type))
    .slice(0, 60);
  const topNicks = Array.from(topNickCountsMap.entries())
    .map(([nick, row_count]) => ({ nick, row_count }))
    .sort((a, b) => (b.row_count - a.row_count) || a.nick.localeCompare(b.nick))
    .slice(0, 30);
  const dailyBreakdown = Array.from(dailyBreakdownMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([log_date, values]) => ({
      log_date,
      total_rows: toSafeInt(values.total_rows),
      chat_rows: toSafeInt(values.chat_rows),
      channel_event_rows: toSafeInt(values.channel_event_rows),
    }));
  const dailyCounts = dailyBreakdown.map((row) => ({
    log_date: row.log_date,
    row_count: row.total_rows,
  }));
  const totalChunkCount = Number.isFinite(Number(chunkProgress?.totalChunkCount))
    ? Math.max(1, Math.floor(Number(chunkProgress.totalChunkCount)))
    : chunks.length;
  const completedChunkCount = Number.isFinite(Number(chunkProgress?.completedChunkCount))
    ? Math.max(0, Math.min(Math.floor(Number(chunkProgress.completedChunkCount)), totalChunkCount))
    : chunks.length;
  const dailyTopNicks = includeDailyTopNicks
    ? Array.from(dailyTopNickMap.entries())
      .map(([mapKey, row_count]) => {
        const separatorPos = mapKey.indexOf('\n');
        return {
          log_date: mapKey.slice(0, separatorPos),
          nick: mapKey.slice(separatorPos + 1),
          row_count,
        };
      })
      .sort((a, b) => {
        if (a.log_date === b.log_date) {
          return (b.row_count - a.row_count) || a.nick.localeCompare(b.nick);
        }
        return a.log_date.localeCompare(b.log_date);
      })
    : [];

  return {
    ...basePayload,
    aggregate: 'stats',
    total_rows: totalRows,
    first_occurred_at: firstOccurredAt || null,
    last_occurred_at: lastOccurredAt || null,
    unique_dates: dailyBreakdown.length,
    unique_nicks: null,
    event_type_counts: eventTypeCounts,
    top_nicks: topNicks,
    daily_counts: dailyCounts,
    include_daily_top_nicks: includeDailyTopNicks,
    daily_top_nicks: dailyTopNicks,
    daily_breakdown: dailyBreakdown,
    chat_rows_total: chatRowsTotal,
    channel_event_rows_total: channelEventRowsTotal,
    stats_cache: {
      status: 'client-chunked',
      ttl_seconds: 0,
    },
    stats_chunking: {
      enabled: true,
      chunk_count: totalChunkCount,
      chunks_loaded: completedChunkCount,
      is_partial: completedChunkCount < totalChunkCount,
      trigger_days: STATS_CHUNK_TRIGGER_DAYS,
      chunk_size_days: STATS_CHUNK_SIZE_DAYS,
      approx_unique_nicks: true,
      approx_top_nicks: true,
    },
  };
}

async function fetchChunkedStatsPayloads(apiKey, body, chunks, options = {}) {
  const queue = chunks.map((chunk, index) => ({ chunk, index }));
  const mergedChunks = new Array(queue.length);
  let emittedSequentialCount = 0;
  const includeDailyTopNicks = Boolean(options?.includeDailyTopNicks);
  const emitProgress = () => {
    if (typeof options?.onChunk !== 'function') {
      return;
    }
    let nextSequentialCount = 0;
    while (nextSequentialCount < mergedChunks.length && typeof mergedChunks[nextSequentialCount] !== 'undefined') {
      nextSequentialCount += 1;
    }
    if (nextSequentialCount <= emittedSequentialCount) {
      return;
    }
    emittedSequentialCount = nextSequentialCount;
    const orderedChunks = mergedChunks.slice(0, nextSequentialCount).map((chunkPayload) => chunkPayload || {});
    const mergedPayload = mergeChunkedStatsPayload(orderedChunks, includeDailyTopNicks, {
      totalChunkCount: mergedChunks.length,
      completedChunkCount: nextSequentialCount,
    });
    options.onChunk({
      payload: mergedPayload,
      chunk_count: mergedChunks.length,
      chunks_loaded: nextSequentialCount,
      is_partial: nextSequentialCount < mergedChunks.length,
    });
  };
  const workers = Array.from({ length: Math.min(STATS_CHUNK_CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      const payload = await fetchStatsPayload(apiKey, {
        ...body,
        ...next.chunk,
      });
      mergedChunks[next.index] = payload || {};
      emitProgress();
    }
  });
  await Promise.all(workers);
  return mergedChunks.map((chunkPayload) => chunkPayload || {});
}

export async function simpleSearch(
  apiKey,
  query,
  channelId,
  networkId,
  dateFrom = '',
  dateTo = '',
  limit = '',
  page = '',
  includeTerms = '',
  excludeTerms = '',
  eventTypes = [],
  focusId = '',
  channelPassword = ''
) {
  const normalizedDateFrom = normalizeDateTimeParam(dateFrom);
  const normalizedDateTo = normalizeDateTimeParam(dateTo);
  const params = new URLSearchParams();
  appendIfPresent(params, 'q', query);
  appendIfPresent(params, 'include_terms', includeTerms);
  appendIfPresent(params, 'exclude_terms', excludeTerms);
  appendIfPresent(params, 'network_id', networkId);
  appendIfPresent(params, 'channel_id', channelId);
  appendIfPresent(params, 'event_types', Array.isArray(eventTypes) ? eventTypes.join(',') : eventTypes);
  appendIfPresent(params, 'focus_id', focusId);
  appendIfPresent(params, 'channel_password', channelPassword);
  appendPagination(params, limit, page);
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
  appendIfPresent(params, 'query_scope', body?.query_scope);
  appendIfPresent(params, 'include_terms', body?.include_terms);
  appendIfPresent(params, 'exclude_terms', body?.exclude_terms);
  appendIfPresent(params, 'network_id', body?.network_id);
  appendIfPresent(params, 'channel_id', body?.channel_id);
  appendIfPresent(params, 'nick', body?.nick);
  appendIfPresent(params, 'user', body?.user);
  appendIfPresent(params, 'host', body?.host);
  appendIfPresent(params, 'date_from', body?.date_from);
  appendIfPresent(params, 'date_to', body?.date_to);
  appendIfPresent(params, 'event_types', body?.event_types);
  appendIfPresent(params, 'focus_id', body?.focus_id);
  appendIfPresent(params, 'channel_password', body?.channel_password);
  appendPagination(params, body?.limit, body?.page);
  const data = await fetchLogQuery(apiKey, params, 'Search failed');
  return data || {};
}

export async function getLogStatistics(apiKey, body = {}, options = {}) {
  const statsChunks = buildStatsDateChunks(body);
  if (statsChunks.length === 0) {
    return fetchStatsPayload(apiKey, body);
  }
  const includeDailyTopNicks = Boolean(body?.include_daily_top_nicks);
  const chunkPayloads = await fetchChunkedStatsPayloads(apiKey, body, statsChunks, {
    onChunk: options?.onChunk,
    includeDailyTopNicks,
  });
  return mergeChunkedStatsPayload(chunkPayloads, includeDailyTopNicks, {
    totalChunkCount: statsChunks.length,
    completedChunkCount: statsChunks.length,
  });
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

export async function getNetworkChannelDateIntervals(apiKey, networkId) {
  const params = new URLSearchParams();
  appendReadSource(params);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const data = await fetchWithFallback(
    apiKey,
    [
      `/irc/api/networks/${networkId}/channels/date-intervals${suffix}`,
      `/api/irclog/networks/${networkId}/channels/date-intervals${suffix}`,
    ],
    {},
    'Failed to fetch channel date intervals',
    { includeAuth: false }
  );
  return data || {};
}

export async function getNicknames(apiKey, searchTerm, options = {}) {
  const term = String(searchTerm || '').trim();
  if (!term) {
    return { success: true, query: '', count: 0, nicknames: [] };
  }
  const params = new URLSearchParams();
  appendIfPresent(params, 'q', term);
  appendIfPresent(params, 'network_id', options?.networkId);
  appendIfPresent(params, 'channel_id', options?.channelId);
  appendIfPresent(params, 'limit', options?.limit || 20);
  appendReadSource(params);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const data = await fetchWithFallback(
    apiKey,
    [`/irc/api/nicknames${suffix}`],
    {},
    'Failed to fetch nicknames',
    { includeAuth: false }
  );
  return data || {};
}

export async function getNickWhois(apiKey, nick, options = {}) {
  const term = String(nick || '').trim();
  if (!term) {
    return { success: true, found: false, nick: '', latest_activity: null, whois: null };
  }
  const params = new URLSearchParams();
  appendIfPresent(params, 'nick', term);
  appendIfPresent(params, 'network_id', options?.networkId);
  appendIfPresent(params, 'channel_id', options?.channelId);
  appendReadSource(params);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const data = await fetchWithFallback(
    apiKey,
    [`/irc/api/nick-whois${suffix}`],
    {},
    'Failed to fetch nick whois',
    { includeAuth: false }
  );
  return data || {};
}

export async function getNickSeen(apiKey, nick, options = {}) {
  const term = String(nick || '').trim();
  if (!term) {
    return { success: true, found: false, nick: '', total_rows: 0 };
  }
  const params = new URLSearchParams();
  appendIfPresent(params, 'nick', term);
  appendIfPresent(params, 'network_id', options?.networkId);
  appendIfPresent(params, 'channel_id', options?.channelId);
  appendReadSource(params);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const data = await fetchWithFallback(
    apiKey,
    ['/irc/api/nick-seen' + suffix],
    {},
    'Failed to fetch nick seen',
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

export async function getChannelDateRange(apiKey, networkId, channelId, channelPassword = '') {
  if (!channelId) {
    return { firstDate: '', lastDate: '', total: 0 };
  }

  const firstParams = new URLSearchParams();
  appendIfPresent(firstParams, 'network_id', networkId);
  appendIfPresent(firstParams, 'channel_id', channelId);
  appendIfPresent(firstParams, 'channel_password', channelPassword);
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
  appendIfPresent(lastParams, 'channel_password', channelPassword);
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
