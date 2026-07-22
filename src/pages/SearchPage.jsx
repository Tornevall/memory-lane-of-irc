import { useEffect, useRef, useState } from 'react';
import {
  simpleSearch,
  advancedSearch,
  getNetworks,
  getNetworkChannels,
  getChannelDateRange,
  getReadSource,
  getPermalinkUrl,
} from '../services/api';

const PAGE_SIZE_OPTIONS = [50, 100, 500, 1000];
const DEFAULT_PAGE_SIZE = 500;
const PAGE_SIZE_COOKIE = 'irclogs_page_size';

function getApiKey() {
  return localStorage.getItem('irc_api_key') || '';
}

function getCookieValue(name) {
  if (typeof document === 'undefined' || !name) return '';
  const cookies = String(document.cookie || '').split(';');
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    if (!trimmed) continue;
    const eqIndex = trimmed.indexOf('=');
    const key = eqIndex >= 0 ? trimmed.slice(0, eqIndex) : trimmed;
    if (key !== name) continue;
    return eqIndex >= 0 ? decodeURIComponent(trimmed.slice(eqIndex + 1)) : '';
  }
  return '';
}

function setCookieValue(name, value, days = 365) {
  if (typeof document === 'undefined' || !name) return;
  const maxAge = Math.max(1, Math.floor(days * 24 * 60 * 60));
  document.cookie = `${name}=${encodeURIComponent(String(value))}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function normalizePageSize(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (PAGE_SIZE_OPTIONS.includes(parsed)) {
    return parsed;
  }
  return DEFAULT_PAGE_SIZE;
}

function getInitialPageSize() {
  const fromCookie = normalizePageSize(getCookieValue(PAGE_SIZE_COOKIE));
  return fromCookie || DEFAULT_PAGE_SIZE;
}

function toLocalDateTimeValue(value, endOfDayForDateOnly = false) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return `${raw}T${endOfDayForDateOnly ? '23:59' : '00:00'}`;
  }
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw)) {
    return raw.slice(0, 16).replace(' ', 'T');
  }
  const candidate = raw.replace(' ', 'T');
  const dt = new Date(candidate);
  if (Number.isNaN(dt.getTime())) {
    return '';
  }
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  const hours = String(dt.getHours()).padStart(2, '0');
  const minutes = String(dt.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

const mircPalette = [
  '#ffffff', '#000000', '#1f4fff', '#3fb950', '#ff4d4f', '#7c8cf8', '#8b5cf6', '#f59e0b',
  '#facc15', '#22c55e', '#2dd4bf', '#38bdf8', '#60a5fa', '#ec4899', '#94a3b8', '#d1d5db',
];

function styleFromState(state) {
  const style = {
    fontWeight: state.bold ? 700 : 400,
    fontStyle: state.italic ? 'italic' : 'normal',
    textDecoration: state.underline ? 'underline' : 'none',
  };
  if (Number.isInteger(state.fg)) {
    style.color = mircPalette[state.fg % mircPalette.length];
  }
  if (Number.isInteger(state.bg)) {
    style.backgroundColor = mircPalette[state.bg % mircPalette.length];
  }
  return style;
}

function renderMircText(input) {
  const text = String(input || '');
  const out = [];
  let buffer = '';
  let key = 0;
  let state = { bold: false, italic: false, underline: false, fg: null, bg: null };

  const flush = () => {
    if (!buffer) return;
    out.push(
      <span key={`m-${key++}`} style={styleFromState(state)}>
        {buffer}
      </span>
    );
    buffer = '';
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const code = ch.charCodeAt(0);

    if (code === 2) { flush(); state = { ...state, bold: !state.bold }; continue; }
    if (code === 29) { flush(); state = { ...state, italic: !state.italic }; continue; }
    if (code === 31) { flush(); state = { ...state, underline: !state.underline }; continue; }
    if (code === 15) { flush(); state = { bold: false, italic: false, underline: false, fg: null, bg: null }; continue; }
    if (code === 22) { flush(); state = { ...state, fg: state.bg, bg: state.fg }; continue; }
    if (code === 3) {
      flush();
      let j = i + 1;
      let fgDigits = '';
      while (j < text.length && fgDigits.length < 2 && /[0-9]/.test(text[j])) { fgDigits += text[j]; j += 1; }
      let bgDigits = '';
      if (j < text.length && text[j] === ',') {
        j += 1;
        while (j < text.length && bgDigits.length < 2 && /[0-9]/.test(text[j])) { bgDigits += text[j]; j += 1; }
      }
      if (fgDigits.length > 0) {
        state = { ...state, fg: Number.parseInt(fgDigits, 10), bg: bgDigits.length > 0 ? Number.parseInt(bgDigits, 10) : null };
      } else {
        state = { ...state, fg: null, bg: null };
      }
      i = j - 1;
      continue;
    }
    buffer += ch;
  }

  flush();
  return out;
}

function pushParam(params, key, value) {
  const normalized = String(value ?? '').trim();
  if (normalized) {
    params.set(key, normalized);
  }
}

function buildSearchParamsFromCriteria(criteria) {
  const normalizedMode = criteria?.mode === 'advanced' ? 'advanced' : 'simple';
  const params = new URLSearchParams();
  params.set('mode', normalizedMode);
  if (criteria?.resultView === 'refined') {
    params.set('view', 'refined');
  }

  pushParam(params, 'q', criteria?.query);
  pushParam(params, 'query', criteria?.query);
  pushParam(params, 'include_terms', criteria?.includeTerms);
  pushParam(params, 'exclude_terms', criteria?.excludeTerms);
  pushParam(params, 'network', criteria?.networkId);
  pushParam(params, 'channel', criteria?.channelId);
  pushParam(params, 'limit', criteria?.limit);
  pushParam(params, 'page', criteria?.page);

  if (normalizedMode === 'simple') {
    pushParam(params, 'from', criteria?.simpleDateTimeFrom);
    pushParam(params, 'to', criteria?.simpleDateTimeTo);
  } else {
    pushParam(params, 'nick', criteria?.nick);
    pushParam(params, 'date_from', criteria?.dateFrom);
    pushParam(params, 'date_to', criteria?.dateTo);
  }

  return params.toString();
}

function parseCriteriaFromLocation(searchText) {
  const params = new URLSearchParams(String(searchText || ''));
  const mode = params.get('mode') === 'advanced' ? 'advanced' : 'simple';
  const view = params.get('view') === 'refined' ? 'refined' : 'classic';
  const rawLimit = normalizePageSize(params.get('limit') || getInitialPageSize());
  const rawPage = Number.parseInt(params.get('page') || '', 10);
  return {
    mode,
    resultView: view,
    query: params.get('q') || params.get('query') || '',
    includeTerms: params.get('include_terms') || '',
    excludeTerms: params.get('exclude_terms') || '',
    networkId: params.get('network') || '',
    channelId: params.get('channel') || '',
    simpleDateTimeFrom: params.get('from') || '',
    simpleDateTimeTo: params.get('to') || '',
    nick: params.get('nick') || '',
    dateFrom: params.get('date_from') || '',
    dateTo: params.get('date_to') || '',
    limit: Number.isFinite(rawLimit) && rawLimit >= 1 ? rawLimit : DEFAULT_PAGE_SIZE,
    page: Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1,
  };
}

function shouldAutoSearchFromCriteria(criteria) {
  const hasTermFilters = String(criteria.includeTerms || '').trim().length > 0
    || String(criteria.excludeTerms || '').trim().length > 0;
  if (criteria.mode === 'advanced') {
    return String(criteria.query || '').trim().length > 0 || hasTermFilters;
  }
  return String(criteria.query || '').trim().length > 0 || hasTermFilters || String(criteria.channelId || '').trim().length > 0;
}

function buildRowIdentity(result, shareSearchQueryString = '', includeSearchInAnchor = true) {
  const fallbackAnchor = `${result.occurred_at ?? ''}-${result.nick ?? ''}-${result.raw_line ?? result.message ?? ''}`.slice(0, 120);
  const rowId = `row-${String(result.id ?? result.log_event_id ?? result.event_id ?? fallbackAnchor).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const searchPart = includeSearchInAnchor
    ? (shareSearchQueryString ? `?${shareSearchQueryString}` : String(window.location.search || ''))
    : '';
  return {
    rowId,
    rowHref: `${window.location.pathname}${searchPart}#${rowId}`,
    hasHashMatch: String(window.location.hash || '') === `#${rowId}`,
  };
}

function formatShortTime(value) {
  if (!value) return '--:--';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    const raw = String(value);
    const m = raw.match(/\b(\d{2}):(\d{2})(?::\d{2})?\b/);
    return m ? `${m[1]}:${m[2]}` : '--:--';
  }
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

function extractIsoDate(value) {
  if (!value) return '';
  const raw = String(value);
  const direct = raw.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (direct) return direct[1];
  const dt = new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function RefinedResultRow({ result, shareSearchQueryString, includeSearchInAnchor }) {
  const { rowId, rowHref, hasHashMatch } = buildRowIdentity(result, shareSearchQueryString, includeSearchInAnchor);
  const rawText = String(result.raw_line ?? result.message ?? '');
  const eventType = String(result.event_type ?? result.type ?? 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
  const eventTypeClass = `type-${eventType.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`;
  const rowShortId = String(result.id ?? result.log_event_id ?? result.event_id ?? '').trim();
  const occurredAtText = result.occurred_at ? new Date(result.occurred_at).toLocaleString() : '--';

  return (
    <div id={rowId} className={`result-row ${hasHashMatch ? 'is-target-row' : ''}`}>
      <div className="result-meta">
        <span className={`event-type ${eventTypeClass}`}>{eventType}</span>
        {rowShortId && <a href={rowHref} className="row-anchor-id" title="Direct link to this row">#{rowShortId}</a>}
        <span className="nick">{result.nick}</span>
        {result.user_host && <span className="hostmask">{result.user_host}</span>}
        <span className="channel">{result.channel}</span>
        <span className="network">{result.network}</span>
        <span className="date"><a href={rowHref} className="row-anchor-time" title="Direct link to this row">{occurredAtText}</a></span>
        {result.permalink && (
          <a href={getPermalinkUrl(result.permalink)} target="_blank" rel="noopener noreferrer" className="permalink">
            ↗
          </a>
        )}
      </div>
      <div className="result-message result-raw">{renderMircText(rawText)}</div>
    </div>
  );
}

function ClassicResultRow({ result, shareSearchQueryString, includeSearchInAnchor }) {
  const { rowId, rowHref, hasHashMatch } = buildRowIdentity(result, shareSearchQueryString, includeSearchInAnchor);
  const eventType = String(result.event_type ?? 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
  const lineBody = String(result.message_text ?? result.event_text ?? result.message ?? result.raw_line ?? '').trim();
  const rowShortId = String(result.id ?? result.log_event_id ?? result.event_id ?? '').trim();
  const nick = String(result.nick || '').trim();
  const channel = String(result.channel || '').trim();
  const userHost = String(result.user_host || '').trim();
  const nickPart = nick ? `<${nick}>` : '';
  const wherePart = channel ? ` ${channel}` : '';
  const hostPart = userHost ? ` (${userHost})` : '';
  const isChannelMessage = channel.startsWith('#');
  const showEventType = !(eventType === 'PRIVMSG' && isChannelMessage);
  const occurredAtRaw = String(result.occurred_at ?? '').trim();
  const occurredAtDate = occurredAtRaw ? new Date(occurredAtRaw.replace(' ', 'T')) : null;
  const occurredAtTitle = occurredAtDate && !Number.isNaN(occurredAtDate.getTime())
    ? occurredAtDate.toLocaleString()
    : (occurredAtRaw || 'Unknown date');
  const timeToken = `[${formatShortTime(result.occurred_at)}]`;

  return (
    <div id={rowId} className={`classic-row ${hasHashMatch ? 'is-target-row' : ''}`}>
      <div className="classic-main">
        {rowShortId && <a href={rowHref} className="row-anchor-id row-anchor-id-classic" title="Direct link to this row">#{rowShortId}</a>}
        <a href={rowHref} className="classic-prefix row-anchor-time" title={occurredAtTitle}>{timeToken}</a>
        {showEventType && <span className="classic-prefix"> [{eventType}]</span>}
        {nickPart && <span className="classic-nick"> {nickPart}</span>}
        {hostPart && <span className="classic-host">{hostPart}</span>}
        {wherePart && <span className="classic-channel">{wherePart}</span>}
        {lineBody && <span className="classic-message"> {renderMircText(lineBody)}</span>}
        {result.permalink && (
          <a href={getPermalinkUrl(result.permalink)} target="_blank" rel="noopener noreferrer" className="permalink permalink-inline">
            ↗
          </a>
        )}
      </div>
    </div>
  );
}

function normalizeDateInput(value, minDate = '', maxDate = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';

  let year;
  let month;
  let day;

  let m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]);
    day = Number(m[3]);
  } else {
    m = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (m) {
      year = Number(m[3]);
      month = Number(m[2]);
      day = Number(m[1]);
    } else {
      return raw;
    }
  }

  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return raw;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(parsed.getTime())
    || parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return raw;
  }

  const iso = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  if (minDate && iso < minDate) return minDate;
  if (maxDate && iso > maxDate) return maxDate;
  return iso;
}

function DateSelector({ value, onChange, minDate = '', maxDate = '', disabled = false, placeholder = 'yyyy-mm-dd' }) {
  const hiddenDateRef = useRef(null);
  const normalized = normalizeDateInput(value, minDate, maxDate);
  const pickerValue = /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';

  const openPicker = () => {
    if (disabled) return;
    const input = hiddenDateRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
    input.focus();
  };

  return (
    <div className="date-selector">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onChange(normalizeDateInput(value, minDate, maxDate))}
        placeholder={placeholder}
        disabled={disabled}
      />
      <button type="button" className="btn-secondary date-picker-btn" onClick={openPicker} disabled={disabled}>
        📅
      </button>
      <input
        ref={hiddenDateRef}
        type="date"
        value={pickerValue}
        min={minDate || undefined}
        max={maxDate || undefined}
        tabIndex={-1}
        className="date-native-input"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export default function SearchPage() {
  const [mode, setMode] = useState('simple');
  const [resultView, setResultView] = useState('classic');
  const [query, setQuery] = useState('');
  const [includeTerms, setIncludeTerms] = useState('');
  const [excludeTerms, setExcludeTerms] = useState('');
  const [networkId, setNetworkId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [networks, setNetworks] = useState([]);
  const [channels, setChannels] = useState([]);
  const [networksReady, setNetworksReady] = useState(false);
  const [channelsReady, setChannelsReady] = useState(false);
  const [loadingNetworks, setLoadingNetworks] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [nick, setNick] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [limit, setLimit] = useState(getInitialPageSize());
  const [page, setPage] = useState(1);
  const [simpleDateTimeFrom, setSimpleDateTimeFrom] = useState('');
  const [simpleDateTimeTo, setSimpleDateTimeTo] = useState('');
  const [simpleMinDateTime, setSimpleMinDateTime] = useState('');
  const [simpleMaxDateTime, setSimpleMaxDateTime] = useState('');
  const [loadingDateRange, setLoadingDateRange] = useState(false);
  const [results, setResults] = useState(null);
  const [lastSearchQueryString, setLastSearchQueryString] = useState('');
  const [includeQueryInAnchorLinks, setIncludeQueryInAnchorLinks] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const channelsRequestSeqRef = useRef(0);
  const channelsCacheRef = useRef(new Map());
  const readSource = getReadSource();
  const normalizedChannelFilter = String(channelFilter || '').trim().toLowerCase();

  function extractArray(payload, preferredKey) {
    if (Array.isArray(payload)) {
      return payload;
    }
    const preferred = payload?.[preferredKey];
    if (Array.isArray(preferred)) {
      return preferred;
    }
    if (preferred && typeof preferred === 'object') {
      return Object.values(preferred);
    }
    if (payload && Array.isArray(payload.results)) {
      return payload.results;
    }
    if (payload && Array.isArray(payload.data)) {
      return payload.data;
    }
    if (payload?.data && Array.isArray(payload.data[preferredKey])) {
      return payload.data[preferredKey];
    }
    if (payload?.data?.[preferredKey] && typeof payload.data[preferredKey] === 'object') {
      return Object.values(payload.data[preferredKey]);
    }
    return [];
  }

  function getEntityId(entity) {
    return entity?.id ?? entity?.network_id ?? entity?.channel_id ?? entity?.value ?? '';
  }

  function getEntityName(entity, fallbackPrefix) {
    return entity?.name
      || entity?.network_name
      || entity?.channel_name
      || entity?.label
      || `${fallbackPrefix} ${getEntityId(entity)}`;
  }

  function getNetworkLabelById(id) {
    const wanted = String(id || '');
    const network = networks.find((n) => String(getEntityId(n)) === wanted);
    return network ? getEntityName(network, 'Network') : '';
  }

  function getChannelLabelById(id) {
    const wanted = String(id || '');
    const channel = channels.find((c) => String(getEntityId(c)) === wanted);
    return channel ? getEntityName(channel, 'Channel') : '';
  }

  function getFilteredChannels() {
    const allChannels = Array.isArray(channels) ? channels : [];
    if (!normalizedChannelFilter) {
      return allChannels;
    }

    return allChannels.filter((channel) => {
      const id = String(getEntityId(channel) || '').toLowerCase();
      const name = String(getEntityName(channel, 'Channel') || '').toLowerCase();
      return id.includes(normalizedChannelFilter) || name.includes(normalizedChannelFilter);
    });
  }

  const filteredChannels = getFilteredChannels();
  const selectedChannelInFilter = !channelId
    || filteredChannels.some((channel) => String(getEntityId(channel)) === String(channelId));
  const selectedChannelObject = !selectedChannelInFilter
    ? channels.find((channel) => String(getEntityId(channel)) === String(channelId))
    : null;
  const channelOptions = selectedChannelObject ? [selectedChannelObject, ...filteredChannels] : filteredChannels;

  function normalizeResultRows(payload, selectedNetworkId = networkId, selectedChannelId = channelId) {
    const rows = extractArray(payload, 'results');
    const selectedNetworkLabel = getNetworkLabelById(selectedNetworkId);
    const selectedChannelLabel = getChannelLabelById(selectedChannelId);
    return rows.map((row) => ({
      ...row,
      ...(function mapIdentity(rawRow) {
        const metadata = typeof rawRow?.metadata_json === 'string'
          ? (() => { try { return JSON.parse(rawRow.metadata_json); } catch { return {}; } })()
          : (typeof rawRow?.metadata_json === 'object' && rawRow?.metadata_json !== null ? rawRow.metadata_json : {});
        const hostmask = String(rawRow?.hostmask ?? metadata?.hostmask ?? '').trim();
        let user = String(rawRow?.user ?? metadata?.user ?? '').trim();
        let host = String(rawRow?.host ?? metadata?.host ?? '').trim();
        if ((!user || !host) && hostmask.includes('@')) {
          const cleaned = hostmask.startsWith('~') ? hostmask.slice(1) : hostmask;
          const parts = cleaned.split('@');
          if (parts.length >= 2) {
            if (!user) user = String(parts[0] || '').trim();
            if (!host) host = String(parts.slice(1).join('@') || '').trim();
          }
        }
        const userHost = user && host ? `${user}@${host}` : hostmask;
        return {
          user,
          host,
          hostmask,
          user_host: userHost,
        };
      }(row)),
      message: row.raw_line ?? row.message ?? row.message_text ?? row.event_text ?? '',
      event_type: row.event_type ?? row.type ?? row.event ?? 'UNKNOWN',
      occurred_at: row.occurred_at ?? row.date ?? row.created_at ?? null,
      network: row.network ?? row.network_name ?? selectedNetworkLabel ?? '',
      channel: row.channel ?? row.channel_name ?? selectedChannelLabel ?? '',
    }));
  }

  function applyDateRange(firstDate, lastDate) {
    const first = toLocalDateTimeValue(firstDate, false);
    const last = toLocalDateTimeValue(lastDate, true);
    const minValue = first || last || '';
    const maxValue = last || first || '';
    setSimpleMinDateTime(minValue);
    setSimpleMaxDateTime(maxValue);
    // Always reset defaults when a channel is selected.
    setSimpleDateTimeFrom(minValue);
    setSimpleDateTimeTo(maxValue);
  }

  async function loadDateRange(selectedNetworkId, selectedChannelId) {
    if (!selectedChannelId) {
      setSimpleDateTimeFrom('');
      setSimpleDateTimeTo('');
      setSimpleMinDateTime('');
      setSimpleMaxDateTime('');
      return;
    }
    const apiKey = getApiKey();
    setLoadingDateRange(true);
    try {
      const range = await getChannelDateRange(apiKey, selectedNetworkId, selectedChannelId);
      applyDateRange(range.firstDate || '', range.lastDate || '');
    } catch {
      setSimpleDateTimeFrom('');
      setSimpleDateTimeTo('');
      setSimpleMinDateTime('');
      setSimpleMaxDateTime('');
    } finally {
      setLoadingDateRange(false);
    }
  }

  async function loadNetworks() {
    const apiKey = getApiKey();
    setLoadingNetworks(true);
    setNetworksReady(false);
    try {
      const payload = await getNetworks(apiKey);
      setNetworks(extractArray(payload, 'networks'));
      setNetworksReady(true);
    } catch (err) {
      setError(err.message || 'Failed to load networks.');
      setNetworks([]);
      setNetworksReady(false);
    } finally {
      setLoadingNetworks(false);
    }
  }

  async function loadChannels(selectedNetworkId, options = {}) {
    const { preserveDateRange = false } = options;
    channelsRequestSeqRef.current += 1;
    const requestSeq = channelsRequestSeqRef.current;
    if (!selectedNetworkId) {
      setChannels([]);
      setChannelsReady(false);
      setLoadingChannels(false);
      return;
    }
    const cacheKey = String(selectedNetworkId);
    const cachedChannels = channelsCacheRef.current.get(cacheKey);
    if (cachedChannels) {
      setChannels(cachedChannels);
      setChannelsReady(true);
      setLoadingChannels(false);
      return;
    }
    const apiKey = getApiKey();
    setChannels([]);
    setChannelsReady(false);
    setLoadingChannels(true);
    try {
      const payload = await getNetworkChannels(apiKey, selectedNetworkId);
      if (requestSeq !== channelsRequestSeqRef.current) {
        return;
      }
      const loadedChannels = extractArray(payload, 'channels');
      channelsCacheRef.current.set(cacheKey, loadedChannels);
      setChannels(loadedChannels);
      setChannelsReady(true);
      if (!preserveDateRange) {
        setSimpleDateTimeFrom('');
        setSimpleDateTimeTo('');
        setSimpleMinDateTime('');
        setSimpleMaxDateTime('');
      }
    } catch (err) {
      if (requestSeq !== channelsRequestSeqRef.current) {
        return;
      }
      setError(err.message || 'Failed to load channels.');
      setChannels([]);
      setChannelsReady(false);
      setSimpleDateTimeFrom('');
      setSimpleDateTimeTo('');
      setSimpleMinDateTime('');
      setSimpleMaxDateTime('');
    } finally {
      if (requestSeq === channelsRequestSeqRef.current) {
        setLoadingChannels(false);
      }
    }
  }

  useEffect(() => {
    loadNetworks();
  }, []);

  useEffect(() => {
    setCookieValue(PAGE_SIZE_COOKIE, normalizePageSize(limit));
  }, [limit]);

  useEffect(() => {
    const parsedCriteria = parseCriteriaFromLocation(window.location.search || '');
    setMode(parsedCriteria.mode);
    setResultView(parsedCriteria.resultView);
    setQuery(parsedCriteria.query);
    setIncludeTerms(parsedCriteria.includeTerms);
    setExcludeTerms(parsedCriteria.excludeTerms);
    setNetworkId(parsedCriteria.networkId);
    setChannelId(parsedCriteria.channelId);
    setSimpleDateTimeFrom(parsedCriteria.simpleDateTimeFrom);
    setSimpleDateTimeTo(parsedCriteria.simpleDateTimeTo);
    setNick(parsedCriteria.nick);
    setDateFrom(parsedCriteria.dateFrom);
    setDateTo(parsedCriteria.dateTo);
    setLimit(normalizePageSize(parsedCriteria.limit));
    setPage(parsedCriteria.page);

    const initialQueryString = buildSearchParamsFromCriteria(parsedCriteria);
    if (initialQueryString) {
      setLastSearchQueryString(initialQueryString);
    }
    if (parsedCriteria.networkId) {
      loadChannels(parsedCriteria.networkId, { preserveDateRange: true });
    }
    if (
      parsedCriteria.networkId
      && parsedCriteria.channelId
      && parsedCriteria.mode === 'simple'
      && !parsedCriteria.simpleDateTimeFrom
      && !parsedCriteria.simpleDateTimeTo
    ) {
      loadDateRange(parsedCriteria.networkId, parsedCriteria.channelId);
    }
    if (shouldAutoSearchFromCriteria(parsedCriteria)) {
      executeSearch(parsedCriteria, { updateUrl: false });
    }
  }, []);

  useEffect(() => {
    const hash = String(window.location.hash || '');
    if (!hash || !results?.results?.length) return;
    const target = document.getElementById(hash.slice(1));
    if (target) {
      target.scrollIntoView({ block: 'center' });
    }
  }, [results]);

  async function executeSearch(criteria, options = {}) {
    const apiKey = getApiKey();
    const { updateUrl = true } = options;
    const normalizedCriteria = {
      mode: criteria?.mode === 'advanced' ? 'advanced' : 'simple',
      resultView: criteria?.resultView === 'refined' ? 'refined' : 'classic',
      query: String(criteria?.query ?? ''),
      includeTerms: String(criteria?.includeTerms ?? ''),
      excludeTerms: String(criteria?.excludeTerms ?? ''),
      networkId: String(criteria?.networkId ?? ''),
      channelId: String(criteria?.channelId ?? ''),
      simpleDateTimeFrom: String(criteria?.simpleDateTimeFrom ?? ''),
      simpleDateTimeTo: String(criteria?.simpleDateTimeTo ?? ''),
      nick: String(criteria?.nick ?? ''),
      dateFrom: String(criteria?.dateFrom ?? ''),
      dateTo: String(criteria?.dateTo ?? ''),
      limit: Number(criteria?.limit ?? DEFAULT_PAGE_SIZE),
      page: Number(criteria?.page ?? 1),
    };
    const shareQueryString = buildSearchParamsFromCriteria(normalizedCriteria);
    setLastSearchQueryString(shareQueryString);
    if (updateUrl) {
      const searchPart = shareQueryString ? `?${shareQueryString}` : '';
      const currentHash = String(window.location.hash || '');
      window.history.replaceState(null, '', `${window.location.pathname}${searchPart}${currentHash}`);
    }

    setLoading(true);
    setError('');
    setResults(null);
    try {
      let data;
      if (normalizedCriteria.mode === 'simple') {
        const trimmedQuery = String(normalizedCriteria.query || '').trim();
        const trimmedIncludeTerms = String(normalizedCriteria.includeTerms || '').trim();
        const trimmedExcludeTerms = String(normalizedCriteria.excludeTerms || '').trim();
        if (!trimmedQuery && !trimmedIncludeTerms && !trimmedExcludeTerms && !normalizedCriteria.channelId) {
          throw new Error('Choose a channel to open chat logs directly, or enter a query.');
        }
        const effectiveFrom = normalizedCriteria.simpleDateTimeFrom
          && normalizedCriteria.simpleDateTimeTo
          && normalizedCriteria.simpleDateTimeFrom > normalizedCriteria.simpleDateTimeTo
          ? normalizedCriteria.simpleDateTimeTo
          : normalizedCriteria.simpleDateTimeFrom;
        const effectiveTo = normalizedCriteria.simpleDateTimeFrom
          && normalizedCriteria.simpleDateTimeTo
          && normalizedCriteria.simpleDateTimeFrom > normalizedCriteria.simpleDateTimeTo
          ? normalizedCriteria.simpleDateTimeFrom
          : normalizedCriteria.simpleDateTimeTo;
        data = await simpleSearch(
          apiKey,
          trimmedQuery,
          normalizedCriteria.channelId,
          normalizedCriteria.networkId,
          effectiveFrom,
          effectiveTo,
          normalizePageSize(normalizedCriteria.limit),
          Number.isFinite(normalizedCriteria.page) && normalizedCriteria.page >= 1 ? normalizedCriteria.page : 1,
          trimmedIncludeTerms,
          trimmedExcludeTerms
        );
      } else {
        const body = {
          query: normalizedCriteria.query,
          include_terms: normalizedCriteria.includeTerms,
          exclude_terms: normalizedCriteria.excludeTerms,
          limit: normalizePageSize(normalizedCriteria.limit),
          page: Number.isFinite(normalizedCriteria.page) && normalizedCriteria.page >= 1 ? normalizedCriteria.page : 1,
        };
        if (normalizedCriteria.networkId) body.network_id = Number(normalizedCriteria.networkId);
        if (normalizedCriteria.channelId) body.channel_id = Number(normalizedCriteria.channelId);
        if (normalizedCriteria.nick) body.nick = normalizedCriteria.nick;
        if (normalizedCriteria.dateFrom) body.date_from = normalizedCriteria.dateFrom;
        if (normalizedCriteria.dateTo) body.date_to = normalizedCriteria.dateTo;
        data = await advancedSearch(apiKey, body);
      }
      setResults({
        ...data,
        results: normalizeResultRows(data, normalizedCriteria.networkId, normalizedCriteria.channelId),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    const firstPage = 1;
    setPage(firstPage);
    await executeSearch({
      mode,
      resultView,
      query,
      includeTerms,
      excludeTerms,
      networkId,
      channelId,
      simpleDateTimeFrom,
      simpleDateTimeTo,
      nick,
      dateFrom,
      dateTo,
      limit,
      page: firstPage,
    });
  }

  async function handlePageNavigation(nextPage) {
    const targetPage = Math.max(1, Number.parseInt(String(nextPage || ''), 10) || 1);
    setPage(targetPage);
    await executeSearch({
      mode,
      resultView,
      query,
      includeTerms,
      excludeTerms,
      networkId,
      channelId,
      simpleDateTimeFrom,
      simpleDateTimeTo,
      nick,
      dateFrom,
      dateTo,
      limit,
      page: targetPage,
    });
  }

  async function handleSimpleDateReset() {
    if (!channelId) {
      setSimpleDateTimeFrom('');
      setSimpleDateTimeTo('');
      setSimpleMinDateTime('');
      setSimpleMaxDateTime('');
      return;
    }

    await loadDateRange(networkId, channelId);
  }

  function buildPaginationPages(currentPage, maxPage) {
    const current = Math.max(1, Number.parseInt(String(currentPage || 1), 10) || 1);
    const last = Math.max(1, Number.parseInt(String(maxPage || 1), 10) || 1);
    const pages = new Set([1, last]);

    for (let p = current - 2; p <= current + 2; p += 1) {
      if (p >= 1 && p <= last) {
        pages.add(p);
      }
    }

    const sorted = Array.from(pages).sort((a, b) => a - b);
    const output = [];
    let previous = 0;
    sorted.forEach((p) => {
      if (previous > 0 && p - previous > 1) {
        output.push('ellipsis');
      }
      output.push(p);
      previous = p;
    });
    return output;
  }

  return (
    <div className="page">
      <h1>Search IRC Logs</h1>
      <div className="mode-toggle">
        <button
          className={mode === 'simple' ? 'active' : ''}
          onClick={() => setMode('simple')}
        >
          Simple Search
        </button>
        <button
          className={mode === 'advanced' ? 'active' : ''}
          onClick={() => setMode('advanced')}
        >
          Advanced Search
        </button>
      </div>

      <form onSubmit={handleSearch} className="search-form">
        <div className="form-row">
          <label>Query</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === 'simple' ? 'Optional. Leave empty to open channel logs.' : 'Search query...'}
            required={mode !== 'simple' && !String(includeTerms || '').trim() && !String(excludeTerms || '').trim()}
          />
        </div>
        <div className="form-row">
          <label>Include words (optional)</label>
          <input
            type="text"
            value={includeTerms}
            onChange={(e) => setIncludeTerms(e.target.value)}
            placeholder={'e.g. flood 1999 or "very old flood"'}
          />
        </div>
        <div className="form-row">
          <label>Exclude words (optional)</label>
          <input
            type="text"
            value={excludeTerms}
            onChange={(e) => setExcludeTerms(e.target.value)}
            placeholder={'e.g. bot or "received server"'}
          />
        </div>
        <div className="form-row">
          <label>Network (optional)</label>
          <select
            value={networkId}
            onChange={(e) => {
              const selected = e.target.value;
              setNetworkId(selected);
              setChannelId('');
              setChannelFilter('');
              setChannels([]);
              setChannelsReady(false);
              setSimpleDateTimeFrom('');
              setSimpleDateTimeTo('');
              setSimpleMinDateTime('');
              setSimpleMaxDateTime('');
              loadChannels(selected);
            }}
            disabled={loadingNetworks || !networksReady}
          >
            <option value="">
              {loadingNetworks ? 'Loading networks...' : (networksReady ? 'All networks' : 'Networks unavailable')}
            </option>
            {networks.map((network) => (
              <option key={String(getEntityId(network))} value={String(getEntityId(network))}>
                {getEntityName(network, 'Network')}
              </option>
            ))}
          </select>
          {loadingNetworks && <small className="loading-hint"><span className="loading-spinner" />Loading networks...</small>}
        </div>
        <div className="form-row">
          <label>Channel (optional)</label>
          <input
            type="text"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            placeholder={networkId ? 'Filter channels (name or id)...' : 'Select network first'}
            disabled={loadingNetworks || !networksReady || !networkId || loadingChannels || !channelsReady}
          />
          <select
            value={channelId}
            onChange={(e) => {
              const selected = e.target.value;
              setChannelId(selected);
              setSimpleDateTimeFrom('');
              setSimpleDateTimeTo('');
              const selectedChannel = channels.find((channel) => String(getEntityId(channel)) === String(selected));
              const first = selectedChannel?.first_date || selectedChannel?.firstDate || '';
              const last = selectedChannel?.last_date || selectedChannel?.lastDate || '';
              if (first || last) {
                applyDateRange(first, last);
              } else {
                loadDateRange(networkId, selected);
              }
            }}
            disabled={loadingNetworks || !networksReady || !networkId || loadingChannels || !channelsReady}
          >
            <option value="">
              {loadingChannels
                ? 'Loading channels...'
                : (networkId ? (channelsReady ? 'All channels in selected network' : 'Loading channels...') : 'Select network first')}
            </option>
            {channelOptions.map((channel) => (
              <option key={String(getEntityId(channel))} value={String(getEntityId(channel))}>
                {getEntityName(channel, 'Channel')}
              </option>
            ))}
          </select>
          {networkId && loadingChannels && <small className="loading-hint"><span className="loading-spinner" />Loading channels...</small>}
          {networkId && !loadingChannels && channels.length === 0 && <small>No channels found for selected network.</small>}
          {networkId && !loadingChannels && channels.length > 0 && channelOptions.length === 0 && <small>No channels match your filter.</small>}
          {networkId && !loadingChannels && channels.length > 0 && channelOptions.length > 0 && (
            <small>Showing {channelOptions.length} of {channels.length} channels.</small>
          )}
          {!loadingChannels && channelId && (
            <small>Reading from: {readSource}</small>
          )}
        </div>
        {mode === 'simple' && (
          <div className="form-row">
            <label>Date & time range (optional)</label>
            <input
              type="datetime-local"
              value={simpleDateTimeFrom}
              onChange={(e) => setSimpleDateTimeFrom(e.target.value)}
              min={simpleMinDateTime || undefined}
              max={simpleMaxDateTime || undefined}
              disabled={!channelId || loadingDateRange}
            />
            <input
              type="datetime-local"
              value={simpleDateTimeTo}
              onChange={(e) => setSimpleDateTimeTo(e.target.value)}
              min={simpleMinDateTime || undefined}
              max={simpleMaxDateTime || undefined}
              disabled={!channelId || loadingDateRange}
            />
            <div className="date-range-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={handleSimpleDateReset}
                disabled={!channelId || loadingDateRange}
              >
                Reset date range
              </button>
            </div>
            {channelId && loadingDateRange && <small>Loading date range...</small>}
            {channelId && !loadingDateRange && (simpleMinDateTime || simpleMaxDateTime) && (
              <small>
                Available range: {simpleMinDateTime || '...'} to {simpleMaxDateTime || '...'}
              </small>
            )}
          </div>
        )}
        {mode === 'advanced' && (
          <>
            <div className="form-row">
              <label>Nick (optional)</label>
              <input
                type="text"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                placeholder="e.g. Robin"
              />
            </div>
            <div className="form-row">
              <label>Date From</label>
              <DateSelector
                value={dateFrom}
                onChange={setDateFrom}
                placeholder="From: yyyy-mm-dd"
              />
            </div>
            <div className="form-row">
              <label>Date To</label>
              <DateSelector
                value={dateTo}
                onChange={setDateTo}
                placeholder="To: yyyy-mm-dd"
              />
            </div>
          </>
        )}
        <div className="form-row">
          <label>Rows per page</label>
          <select
            value={String(limit)}
            onChange={(e) => {
              const nextLimit = normalizePageSize(e.target.value);
              setLimit(nextLimit);
              setPage(1);
            }}
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={String(option)}>{option}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Loading…' : (mode === 'simple' && !String(query || '').trim() ? 'Open channel' : 'Search')}
        </button>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {results && (
        <div className="results">
          {(() => {
            const rows = Array.isArray(results.results) ? results.results : [];
            const total = Number.parseInt(String(results.total ?? rows.length ?? 0), 10) || 0;
            const currentLimit = normalizePageSize(results.limit ?? limit);
            const offsetFromResponse = Math.max(0, Number.parseInt(String(results.offset ?? 0), 10) || 0);
            const pageFromOffset = Math.floor(offsetFromResponse / Math.max(1, currentLimit)) + 1;
            const currentPage = Math.max(1, Number.parseInt(String(results.page ?? pageFromOffset ?? page ?? 1), 10) || 1);
            const maxPageByTotal = total > 0 ? Math.max(1, Math.ceil(total / Math.max(1, currentLimit))) : currentPage;
            const hasPrev = currentPage > 1;
            const hasNext = total > 0
              ? currentPage < maxPageByTotal
              : rows.length >= currentLimit;
            const pageItems = buildPaginationPages(currentPage, maxPageByTotal);
            const renderPaginationControls = (positionKey = 'top') => (
              <div className={`results-pagination results-pagination--${positionKey}`}>
                <button type="button" className="btn-secondary" disabled={loading || !hasPrev} onClick={() => handlePageNavigation(currentPage - 1)}>
                  Previous
                </button>
                <div className="results-page-numbers" aria-label="Page numbers">
                  {pageItems.map((item, idx) => {
                    if (item === 'ellipsis') {
                      return <span key={`ellipsis-${positionKey}-${idx}`} className="results-page-ellipsis">…</span>;
                    }
                    const pageNumber = Number(item);
                    const isActive = pageNumber === currentPage;
                    return (
                      <button
                        key={`page-${positionKey}-${pageNumber}`}
                        type="button"
                        className={`btn-secondary results-page-number${isActive ? ' is-active' : ''}`}
                        disabled={loading || isActive}
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => handlePageNavigation(pageNumber)}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                </div>
                <span className="results-page-indicator">
                  Page {currentPage}{total > 0 ? ` / ${maxPageByTotal}` : ''}
                </span>
                <button type="button" className="btn-secondary" disabled={loading || !hasNext} onClick={() => handlePageNavigation(currentPage + 1)}>
                  Next
                </button>
              </div>
            );
            return (
              <>
                {renderPaginationControls('top')}
              </>
            );
          })()}
          <div className="results-header-row">
            <div className="results-header">
              Found {results.total ?? results.results?.length ?? 0} results
              {results.page && ` (page ${results.page})`}
            </div>
            <div className="results-controls">
              <label className="anchor-link-toggle" title="Include current query/filter params in # anchors">
                <input
                  type="checkbox"
                  checked={includeQueryInAnchorLinks}
                  onChange={(e) => setIncludeQueryInAnchorLinks(Boolean(e.target.checked))}
                />
                <span>Include query in # links</span>
              </label>
              <div className="view-toggle">
                <button type="button" className={resultView === 'classic' ? 'active' : ''} onClick={() => setResultView('classic')}>Classic log view</button>
                <button type="button" className={resultView === 'refined' ? 'active' : ''} onClick={() => setResultView('refined')}>Refined cards</button>
              </div>
            </div>
          </div>
          {results.results?.length === 0 && <p>No results found.</p>}
          {(() => {
            const rows = Array.isArray(results.results) ? results.results : [];
            const rendered = [];
            let previousDate = '';
            rows.forEach((row, idx) => {
              const rowDate = extractIsoDate(row?.occurred_at);
              if (rowDate && rowDate !== previousDate) {
                rendered.push(
                  <div key={`date-separator-${rowDate}-${idx}`} className="result-date-separator">
                    {rowDate}
                  </div>
                );
                previousDate = rowDate;
              }
              const rowKey = String(row.id ?? row.log_event_id ?? `${row.occurred_at}-${row.nick}-${row.event_type}`);
              rendered.push(
                resultView === 'classic'
                  ? <ClassicResultRow key={rowKey} result={row} shareSearchQueryString={lastSearchQueryString} includeSearchInAnchor={includeQueryInAnchorLinks} />
                  : <RefinedResultRow key={rowKey} result={row} shareSearchQueryString={lastSearchQueryString} includeSearchInAnchor={includeQueryInAnchorLinks} />
              );
            });
            return rendered;
          })()}
          {(() => {
            const rows = Array.isArray(results.results) ? results.results : [];
            const total = Number.parseInt(String(results.total ?? rows.length ?? 0), 10) || 0;
            const currentLimit = normalizePageSize(results.limit ?? limit);
            const offsetFromResponse = Math.max(0, Number.parseInt(String(results.offset ?? 0), 10) || 0);
            const pageFromOffset = Math.floor(offsetFromResponse / Math.max(1, currentLimit)) + 1;
            const currentPage = Math.max(1, Number.parseInt(String(results.page ?? pageFromOffset ?? page ?? 1), 10) || 1);
            const maxPageByTotal = total > 0 ? Math.max(1, Math.ceil(total / Math.max(1, currentLimit))) : currentPage;
            const hasPrev = currentPage > 1;
            const hasNext = total > 0
              ? currentPage < maxPageByTotal
              : rows.length >= currentLimit;
            const pageItems = buildPaginationPages(currentPage, maxPageByTotal);

            return (
              <div className="results-pagination results-pagination--bottom">
                <button type="button" className="btn-secondary" disabled={loading || !hasPrev} onClick={() => handlePageNavigation(currentPage - 1)}>
                  Previous
                </button>
                <div className="results-page-numbers" aria-label="Page numbers">
                  {pageItems.map((item, idx) => {
                    if (item === 'ellipsis') {
                      return <span key={`ellipsis-bottom-${idx}`} className="results-page-ellipsis">…</span>;
                    }
                    const pageNumber = Number(item);
                    const isActive = pageNumber === currentPage;
                    return (
                      <button
                        key={`page-bottom-${pageNumber}`}
                        type="button"
                        className={`btn-secondary results-page-number${isActive ? ' is-active' : ''}`}
                        disabled={loading || isActive}
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => handlePageNavigation(pageNumber)}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                </div>
                <span className="results-page-indicator">
                  Page {currentPage}{total > 0 ? ` / ${maxPageByTotal}` : ''}
                </span>
                <button type="button" className="btn-secondary" disabled={loading || !hasNext} onClick={() => handlePageNavigation(currentPage + 1)}>
                  Next
                </button>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
