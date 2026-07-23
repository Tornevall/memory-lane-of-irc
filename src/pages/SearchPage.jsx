import { useEffect, useRef, useState } from 'react';
import {
  simpleSearch,
  advancedSearch,
  getLogStatistics,
  getNetworks,
  getNetworkChannelDateIntervals,
  getNicknames,
  getNickWhois,
  getNickSeen,
  getChannelDateRange,
  getReadSource,
  getPermalinkUrl,
} from '../services/api';

const PAGE_SIZE_OPTIONS = [50, 100, 500, 1000];
const DEFAULT_PAGE_SIZE = 500;
const PAGE_SIZE_COOKIE = 'irclogs_page_size';
const CHANNEL_ACTIVITY_THRESHOLD_KEY = 'irclogs_channel_activity_threshold';
const EVENT_TYPE_OPTIONS = [
  'PRIVMSG', 'ACTION', 'JOIN', 'PART', 'QUIT', 'NICK', 'KICK', 'TOPIC', 'MODE',
  'NOTICE', 'CTCP', 'INVITE', 'NOTIFY', 'WHOIS', 'NAMES', 'USERS',
  'RAW', 'ERROR', 'WALLOPS', 'SERVER', 'SQUIT', 'NETSPLIT', 'NETMERGE',
];
const DEFAULT_ACTIVE_EVENT_TYPES = ['PRIVMSG', 'ACTION'];
const CHAT_EVENT_TYPES = new Set(DEFAULT_ACTIVE_EVENT_TYPES);
const ADVANCED_QUERY_SCOPE_OPTIONS = [
  { value: 'all', label: 'All fields' },
  { value: 'message', label: 'Channel text' },
  { value: 'nick', label: 'Nick/name' },
  { value: 'host', label: 'Host/userhost' },
  { value: 'channel', label: 'Channel name' },
  { value: 'target', label: 'Target/recipient' },
];

function normalizeAdvancedQueryScope(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ADVANCED_QUERY_SCOPE_OPTIONS.some((item) => item.value === normalized) ? normalized : 'all';
}

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

function normalizeChannelActivityThreshold(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (Number.isFinite(parsed) && parsed >= 30) {
    return parsed;
  }
  return 30;
}

function getInitialChannelActivityThreshold() {
  if (typeof window === 'undefined') {
    return '30';
  }
  const saved = normalizeChannelActivityThreshold(window.localStorage.getItem(CHANNEL_ACTIVITY_THRESHOLD_KEY));
  return String(saved);
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

function normalizeEventTypes(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value
      .map((item) => String(item || '').trim().toUpperCase())
      .filter((item) => item !== '')));
  }
  if (typeof value === 'string') {
    return normalizeEventTypes(value.split(','));
  }
  return [];
}

function buildSearchParamsFromCriteria(criteria) {
  const normalizedMode = ['simple', 'advanced', 'statistics'].includes(String(criteria?.mode || ''))
    ? String(criteria.mode)
    : 'simple';
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

  if (normalizedMode === 'simple' || normalizedMode === 'statistics') {
    pushParam(params, 'from', criteria?.simpleDateTimeFrom);
    pushParam(params, 'to', criteria?.simpleDateTimeTo);
  } else {
    pushParam(params, 'query_scope', normalizeAdvancedQueryScope(criteria?.queryScope));
    pushParam(params, 'nick', criteria?.nick);
    pushParam(params, 'date_from', criteria?.dateFrom);
    pushParam(params, 'date_to', criteria?.dateTo);
  }
  pushParam(params, 'event_types', normalizeEventTypes(criteria?.eventTypes).join(','));

  return params.toString();
}

function parseCriteriaFromLocation(searchText) {
  const params = new URLSearchParams(String(searchText || ''));
  const rawMode = String(params.get('mode') || '').trim().toLowerCase();
  const mode = ['simple', 'advanced', 'statistics'].includes(rawMode) ? rawMode : 'simple';
  const view = params.get('view') === 'refined' ? 'refined' : 'classic';
  const rawEventTypes = params.get('event_types');
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
    queryScope: normalizeAdvancedQueryScope(params.get('query_scope') || 'all'),
    nick: params.get('nick') || '',
    dateFrom: params.get('date_from') || '',
    dateTo: params.get('date_to') || '',
    eventTypes: rawEventTypes === null
      ? [...DEFAULT_ACTIVE_EVENT_TYPES]
      : normalizeEventTypes(rawEventTypes || ''),
    focusId: params.get('focus_id') || '',
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
  if (criteria.mode === 'statistics') {
    return true;
  }
  return String(criteria.query || '').trim().length > 0 || hasTermFilters || String(criteria.channelId || '').trim().length > 0;
}

function buildRowIdentity(result, shareSearchQueryString = '', includeSearchInAnchor = true) {
  const fallbackAnchor = `${result.occurred_at ?? ''}-${result.nick ?? ''}-${result.raw_line ?? result.message ?? ''}`.slice(0, 120);
  const databaseId = String(result.id ?? result.log_event_id ?? result.event_id ?? '').trim();
  const rowId = databaseId
    ? `row-${databaseId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
    : `row-fallback-${String(fallbackAnchor).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const params = includeSearchInAnchor
    ? new URLSearchParams(
      String(shareSearchQueryString || String(window.location.search || '').replace(/^\?/, ''))
    )
    : new URLSearchParams(String(window.location.search || '').replace(/^\?/, ''));
  if (!includeSearchInAnchor) {
    params.delete('q');
    params.delete('query');
  }
  const rowNetworkId = String(result?.network_id ?? result?.networkId ?? '').trim();
  const rowChannelId = String(result?.channel_id ?? result?.channelId ?? '').trim();
  if (!String(params.get('network') || '').trim() && rowNetworkId) {
    params.set('network', rowNetworkId);
  }
  if (!String(params.get('channel') || '').trim() && rowChannelId) {
    params.set('channel', rowChannelId);
  }
  if (databaseId) {
    params.set('focus_id', databaseId);
  }
  const sanitized = params.toString();
  const searchPart = sanitized ? `?${sanitized}` : '';
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  return {
    rowId,
    rowHref: `${baseUrl}${searchPart}#${rowId}`,
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

function RefinedResultRow({ result, shareSearchQueryString, includeSearchInAnchor, onNickClick }) {
  const { rowId, rowHref, hasHashMatch } = buildRowIdentity(result, shareSearchQueryString, includeSearchInAnchor);
  const rawText = String(result.raw_line ?? result.message ?? '');
  const eventType = String(result.event_type ?? result.type ?? 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
  const eventTypeClass = `type-${eventType.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`;
  const rowShortId = String(result.id ?? result.log_event_id ?? result.event_id ?? '').trim();
  const occurredAtText = result.occurred_at ? new Date(result.occurred_at).toLocaleString() : '--';
  const rowNick = String(result.nick || '').trim();

  return (
    <div id={rowId} className={`result-row ${hasHashMatch ? 'is-target-row' : ''}`}>
      <div className="result-meta">
        <span className={`event-type ${eventTypeClass}`}>{eventType}</span>
        {rowShortId && <a href={rowHref} className="row-anchor-id" title="Direct link to this row">#{rowShortId}</a>}
        {rowNick ? (
          <button type="button" className="nick nick-button" onClick={() => onNickClick(rowNick, result)}>{rowNick}</button>
        ) : (
          <span className="nick" />
        )}
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

function ClassicResultRow({ result, shareSearchQueryString, includeSearchInAnchor, onNickClick, showNetwork = true }) {
  const { rowId, rowHref, hasHashMatch } = buildRowIdentity(result, shareSearchQueryString, includeSearchInAnchor);
  const eventType = String(result.event_type ?? 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
  const lineBody = String(result.message_text ?? result.event_text ?? result.message ?? result.raw_line ?? '').trim();
  const rowShortId = String(result.id ?? result.log_event_id ?? result.event_id ?? '').trim();
  const nick = String(result.nick || '').trim();
  const channel = String(result.channel || '').trim();
  const network = String(result.network || '').trim();
  const userHost = String(result.user_host || '').trim();
  const wherePart = channel ? ` ${channel}` : '';
  const networkPart = showNetwork && network ? ` [${network}]` : '';
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
        {nick && (
          <button type="button" className="classic-nick classic-nick-button" onClick={() => onNickClick(nick, result)}>
            {` <${nick}>`}
          </button>
        )}
        {hostPart && <span className="classic-host">{hostPart}</span>}
        {wherePart && <span className="classic-channel">{wherePart}</span>}
        {networkPart && <span className="classic-network">{networkPart}</span>}
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

function getBulkPreviewLines(result) {
  const raw = String(result.message_text ?? result.raw_line ?? '').trim();
  if (!raw) return [];
  const summaryPart = raw.includes('—') ? raw.split('—').slice(1).join('—').trim() : raw;
  return summaryPart
    .split(' | ')
    .map((line) => String(line || '').trim())
    .filter((line) => line !== '');
}

function BulkEventCard({ result, shareSearchQueryString, includeSearchInAnchor, onNickClick, variant = 'refined', showNetwork = true }) {
  const { rowId, rowHref, hasHashMatch } = buildRowIdentity(result, shareSearchQueryString, includeSearchInAnchor);
  const eventType = String(result.event_type ?? 'MODE_BULK').trim().toUpperCase() || 'MODE_BULK';
  const rowShortId = String(result.id ?? result.log_event_id ?? result.event_id ?? '').trim();
  const network = String(result.network || '').trim();
  const channel = String(result.channel || '').trim();
  const nick = String(result.nick || '[server]').trim();
  const previewLines = getBulkPreviewLines(result);
  const bulkCount = Number(result.bulk_event_count ?? result.bulk_count ?? previewLines.length ?? 0) || 0;
  const summaryText = String(result.message_text || '').trim();
  const countLabel = bulkCount > 0 ? `${bulkCount} changes` : 'Bulk changes';

  if (variant === 'classic') {
    return (
      <div id={rowId} className={`classic-row classic-row--bulk ${hasHashMatch ? 'is-target-row' : ''}`}>
        <div className="classic-main classic-main--bulk">
          <a href={rowHref} className="row-anchor-id row-anchor-id-classic" title="Direct link to this row">#{rowShortId}</a>
          <span className="classic-prefix">[{eventType}]</span>
          <button type="button" className="classic-nick classic-nick-button" onClick={() => onNickClick(nick, result)}>
            {` <${nick}>`}
          </button>
          {channel && <span className="classic-channel"> {channel}</span>}
          {showNetwork && network && <span className="classic-network"> [{network}]</span>}
        </div>
        <div className="bulk-card">
          <div className="bulk-card-summary">
            <span className="bulk-card-count">{countLabel}</span>
            <span className="bulk-card-text">{summaryText || 'Bulk event'}</span>
          </div>
          {previewLines.length > 0 && (
            <div className="bulk-card-preview">
              {previewLines.map((line, index) => (
                <div key={`${rowId}-bulk-${index}`} className="bulk-card-line">{line}</div>
              ))}
            </div>
          )}
          {rowHref && (
            <a href={rowHref} className="bulk-card-link" title="Direct link to this row">Open row</a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div id={rowId} className={`result-row result-row--bulk ${hasHashMatch ? 'is-target-row' : ''}`}>
      <div className="result-meta bulk-meta">
        <span className={`event-type ${`type-${eventType.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`}`}>{eventType}</span>
        {rowShortId && <a href={rowHref} className="row-anchor-id" title="Direct link to this row">#{rowShortId}</a>}
        <span className="nick"> &lt;{nick}&gt;</span>
        {channel && <span className="channel">{channel}</span>}
        {showNetwork && network && <span className="network">[{network}]</span>}
        <span className="bulk-count-pill">{countLabel}</span>
      </div>
      <div className="bulk-card">
        <div className="bulk-card-summary">
          <span className="bulk-card-text">{summaryText || 'Bulk event'}</span>
        </div>
        {previewLines.length > 0 && (
          <div className="bulk-card-preview">
            {previewLines.map((line, index) => (
              <div key={`${rowId}-bulk-${index}`} className="bulk-card-line">{line}</div>
            ))}
          </div>
        )}
        {rowHref && (
          <a href={rowHref} className="bulk-card-link" title="Direct link to this row">Open row</a>
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

function DateSelector({ value, onChange, onCommit, minDate = '', maxDate = '', disabled = false, placeholder = 'yyyy-mm-dd' }) {
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
        onBlur={() => {
          const nextValue = normalizeDateInput(value, minDate, maxDate);
          onChange(nextValue);
          if (typeof onCommit === 'function') {
            onCommit(nextValue);
          }
        }}
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
        onChange={(e) => {
          const nextValue = e.target.value;
          onChange(nextValue);
          if (typeof onCommit === 'function') {
            onCommit(nextValue);
          }
        }}
      />
    </div>
  );
}

function normalizeMiniStats(payload) {
  if (!payload) return null;
  const topNicks = Array.isArray(payload.top_nicks) ? payload.top_nicks : [];
  return {
    totalRows: toSafeNumber(payload.total_rows),
    uniqueNicks: toSafeNumber(payload.unique_nicks ?? topNicks.length),
    uniqueDates: toSafeNumber(payload.unique_dates),
    firstSeen: String(payload.first_occurred_at || payload.first_seen_at || '').trim(),
    lastSeen: String(payload.last_occurred_at || payload.last_seen_at || '').trim(),
    chatRowsTotal: toSafeNumber(payload.chat_rows_total),
    channelEventRowsTotal: toSafeNumber(payload.channel_event_rows_total),
  };
}

function toSafeNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
}

function compactNumber(value) {
  const n = toSafeNumber(value);
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function formatDateLabel(value, options = {}) {
  const includeYear = options.includeYear !== false;
  const raw = String(value || '').trim();
  const rangeParts = raw.split('..');
  const pick = String(rangeParts[0] || raw).trim();
  const m = pick.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return raw;
  if (includeYear) return `${m[1]}-${m[2]}-${m[3]}`;
  return `${m[2]}-${m[3]}`;
}

function buildAxisTickIndexes(length, desired = 6) {
  const total = Math.max(0, Number(length) || 0);
  if (total <= 0) return [];
  if (total <= desired) return Array.from({ length: total }, (_, i) => i);
  const lastIndex = total - 1;
  const ticks = new Set([0, lastIndex]);
  for (let i = 1; i < desired - 1; i += 1) {
    ticks.add(Math.round((i / (desired - 1)) * lastIndex));
  }
  return Array.from(ticks).sort((a, b) => a - b);
}

function buildDailyRows(statsPayload) {
  const breakdownRows = Array.isArray(statsPayload?.daily_breakdown)
    ? statsPayload.daily_breakdown
    : [];
  if (breakdownRows.length > 0) {
    return breakdownRows
      .map((row) => ({
        date: String(row?.log_date || '').trim(),
        total_rows: toSafeNumber(row?.total_rows ?? row?.row_count),
        chat_rows: toSafeNumber(row?.chat_rows),
        channel_event_rows: toSafeNumber(row?.channel_event_rows),
      }))
      .filter((row) => row.date !== '');
  }

  const dailyRows = Array.isArray(statsPayload?.daily_counts) ? statsPayload.daily_counts : [];
  if (dailyRows.length === 0) return [];

  const eventTypeCounts = Array.isArray(statsPayload?.event_type_counts) ? statsPayload.event_type_counts : [];
  const totalsByType = eventTypeCounts.reduce((acc, row) => {
    const eventType = String(row?.event_type || '').trim().toUpperCase();
    if (!eventType) return acc;
    acc[eventType] = (acc[eventType] || 0) + toSafeNumber(row?.row_count);
    return acc;
  }, {});
  const totalRowsByType = Object.values(totalsByType).reduce((sum, value) => sum + toSafeNumber(value), 0);
  const chatRowsTotal = Object.entries(totalsByType).reduce((sum, [eventType, value]) => (
    CHAT_EVENT_TYPES.has(eventType) ? sum + toSafeNumber(value) : sum
  ), 0);
  const chatRatio = totalRowsByType > 0 ? chatRowsTotal / totalRowsByType : 0;

  return dailyRows
    .map((row) => {
      const totalRows = toSafeNumber(row?.row_count ?? row?.total_rows);
      const chatRows = Math.round(totalRows * chatRatio);
      return {
        date: String(row?.log_date || '').trim(),
        total_rows: totalRows,
        chat_rows: chatRows,
        channel_event_rows: Math.max(totalRows - chatRows, 0),
      };
    })
    .filter((row) => row.date !== '');
}

function bucketDailyRows(rows, maxBuckets = 120) {
  if (!Array.isArray(rows) || rows.length <= maxBuckets) return Array.isArray(rows) ? rows : [];
  const bucketSize = Math.ceil(rows.length / maxBuckets);
  const buckets = [];
  for (let i = 0; i < rows.length; i += bucketSize) {
    const slice = rows.slice(i, i + bucketSize);
    if (slice.length === 0) continue;
    const first = slice[0];
    const last = slice[slice.length - 1];
    buckets.push({
      date: `${first.date}${first.date !== last.date ? `..${last.date}` : ''}`,
      total_rows: slice.reduce((sum, row) => sum + toSafeNumber(row.total_rows), 0),
      chat_rows: slice.reduce((sum, row) => sum + toSafeNumber(row.chat_rows), 0),
      channel_event_rows: slice.reduce((sum, row) => sum + toSafeNumber(row.channel_event_rows), 0),
    });
  }

  return buckets;
}

function pieSlicePath(cx, cy, r, startAngleDeg, endAngleDeg) {
  const startRad = (startAngleDeg * Math.PI) / 180;
  const endRad = (endAngleDeg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const largeArc = endAngleDeg - startAngleDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function StatsDailyChart({ rows, chartType, showTotal, showChat, showEvents }) {
  const width = 960;
  const height = 320;
  const left = 48;
  const right = 16;
  const top = 14;
  const bottom = 36;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const bucketedRows = bucketDailyRows(rows, 120);
  const series = [
    { key: 'total_rows', label: 'Total', color: '#60a5fa', enabled: showTotal },
    { key: 'chat_rows', label: 'Chat texts', color: '#22c55e', enabled: showChat },
    { key: 'channel_event_rows', label: 'Channel events', color: '#f59e0b', enabled: showEvents },
  ].filter((item) => item.enabled);

  if (bucketedRows.length === 0 || series.length === 0) {
    return <div className="empty-state">No chart data for current selection.</div>;
  }

  if (chartType === 'pie') {
    const pieValues = series.map((item) => ({
      ...item,
      value: bucketedRows.reduce((sum, row) => sum + toSafeNumber(row[item.key]), 0),
    })).filter((item) => item.value > 0);
    const total = pieValues.reduce((sum, item) => sum + item.value, 0);
    if (total <= 0 || pieValues.length === 0) {
      return <div className="empty-state">No chart data for current selection.</div>;
    }
    let cursor = -90;
    return (
      <div className="stats-chart-wrap">
        <svg className="stats-chart" viewBox="0 0 560 320" role="img" aria-label="Pie chart for selected statistics">
          {pieValues.map((item) => {
            const degrees = (item.value / total) * 360;
            const start = cursor;
            const end = cursor + degrees;
            cursor = end;
            return <path key={`pie-${item.key}`} d={pieSlicePath(180, 160, 120, start, end)} fill={item.color} />;
          })}
        </svg>
        <div className="stats-chart-legend">
          {pieValues.map((item) => (
            <div key={`legend-pie-${item.key}`} className="stats-chart-legend-row">
              <span className="stats-color-dot" style={{ backgroundColor: item.color }} />
              <span>{item.label}</span>
              <span>{compactNumber(item.value)} ({((item.value / total) * 100).toFixed(1)}%)</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const maxValue = Math.max(
    1,
    ...bucketedRows.flatMap((row) => series.map((item) => toSafeNumber(row[item.key])))
  );
  const bandWidth = plotWidth / Math.max(bucketedRows.length, 1);
  const xForIndex = (index) => left + (index * bandWidth) + (bandWidth / 2);
  const yForValue = (value) => top + ((maxValue - toSafeNumber(value)) / maxValue) * plotHeight;
  const yTop = yForValue(maxValue);
  const yBottom = yForValue(0);
  const xTickIndexes = buildAxisTickIndexes(bucketedRows.length, 7);
  const yGridTicks = [0, 0.25, 0.5, 0.75, 1];
  const dateStartLabel = formatDateLabel(bucketedRows[0]?.date || '', { includeYear: true });
  const dateEndLabel = formatDateLabel(bucketedRows[bucketedRows.length - 1]?.date || '', { includeYear: true });

  return (
    <div className="stats-chart-block">
      <svg className="stats-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${chartType} chart for daily activity`}>
        {yGridTicks.map((ratio) => {
          const y = top + (plotHeight * ratio);
          return (
            <line key={`grid-y-${ratio}`} x1={left} y1={y} x2={left + plotWidth} y2={y} stroke="#1e293b" strokeDasharray="3 4" />
          );
        })}
      <line x1={left} y1={yTop} x2={left} y2={yBottom} stroke="#334155" />
      <line x1={left} y1={yBottom} x2={left + plotWidth} y2={yBottom} stroke="#334155" />
      <text x={8} y={yTop + 4} fill="#94a3b8" fontSize="11">{compactNumber(maxValue)}</text>
      <text x={16} y={yBottom + 4} fill="#94a3b8" fontSize="11">0</text>

      {chartType === 'bar' && bucketedRows.map((row, idx) => {
        const activeSeriesCount = Math.max(series.length, 1);
        const innerPad = Math.min(2, bandWidth * 0.08);
        const totalBarWidth = Math.max(bandWidth - (innerPad * 2), 1);
        const singleBarWidth = Math.max(totalBarWidth / activeSeriesCount, 1);
        return series.map((item, seriesIndex) => {
          const value = toSafeNumber(row[item.key]);
          const x = left + (idx * bandWidth) + innerPad + (seriesIndex * singleBarWidth);
          const y = yForValue(value);
          const h = Math.max(yBottom - y, 0);
          return (
            <rect
              key={`bar-${idx}-${item.key}`}
              x={x}
              y={y}
              width={Math.max(singleBarWidth - 1, 1)}
              height={Math.max(h, 0)}
              fill={item.color}
              opacity="0.9"
            />
          );
        });
      })}

      {chartType === 'line' && series.map((item) => {
        const points = bucketedRows
          .map((row, idx) => `${xForIndex(idx)},${yForValue(row[item.key])}`)
          .join(' ');
        return (
          <polyline
            key={`line-${item.key}`}
            fill="none"
            stroke={item.color}
            strokeWidth="2.5"
            points={points}
          />
        );
      })}

        {xTickIndexes.map((idx) => {
          const x = xForIndex(idx);
          const rowDate = bucketedRows[idx]?.date || '';
          const label = formatDateLabel(rowDate, { includeYear: true });
          return (
            <g key={`tick-x-${idx}`}>
              <line x1={x} y1={yBottom} x2={x} y2={yBottom + 5} stroke="#334155" />
              <text x={x} y={height - 10} fill="#94a3b8" fontSize="10" textAnchor="middle">{label}</text>
            </g>
          );
        })}
      </svg>
      <div className="stats-chart-date-range">Date range: {dateStartLabel || 'n/a'} → {dateEndLabel || 'n/a'}</div>
    </div>
  );
}

function StatsTopNicksChart({ rows, dailyRows, selectedNicks, chartType }) {
  const selectedSet = new Set((Array.isArray(selectedNicks) ? selectedNicks : []).map((nick) => String(nick || '').trim().toLowerCase()));
  const selectedRows = (Array.isArray(rows) ? rows : [])
    .filter((row) => selectedSet.has(String(row?.nick || '').trim().toLowerCase()))
    .map((row) => ({
      nick: String(row?.nick || '').trim() || '?',
      value: toSafeNumber(row?.row_count),
    }))
    .filter((row) => row.value > 0);

  if (selectedRows.length === 0) {
    return <div className="empty-state">No top-nick chart data for current selection.</div>;
  }

  const palette = ['#60a5fa', '#22c55e', '#f59e0b', '#a78bfa', '#f472b6', '#34d399', '#fb7185', '#93c5fd', '#14b8a6', '#f97316', '#84cc16', '#38bdf8'];
  const colorByNick = selectedRows.reduce((acc, row, idx) => {
    acc[row.nick] = palette[idx % palette.length];
    return acc;
  }, {});

  if (chartType === 'pie') {
    const total = selectedRows.reduce((sum, row) => sum + row.value, 0);
    const pieSlices = selectedRows.reduce((acc, row) => {
      const previousEnd = acc.length > 0 ? acc[acc.length - 1].end : -90;
      const degrees = (row.value / total) * 360;
      acc.push({
        row,
        start: previousEnd,
        end: previousEnd + degrees,
      });
      return acc;
    }, []);
    return (
      <div className="stats-chart-wrap">
        <svg className="stats-chart" viewBox="0 0 560 320" role="img" aria-label="Top-nicks pie chart">
          {pieSlices.map((slice, idx) => {
            const nickRow = slice.row;
            return <path key={`nick-pie-${nickRow.nick}`} d={pieSlicePath(180, 160, 120, slice.start, slice.end)} fill={palette[idx % palette.length]} />;
          })}
        </svg>
        <div className="stats-chart-legend">
          {pieSlices.map((slice, idx) => (
            <div key={`nick-legend-${slice.row.nick}`} className="stats-chart-legend-row">
              <span className="stats-color-dot" style={{ backgroundColor: colorByNick[slice.row.nick] || palette[idx % palette.length] }} />
              <span>{slice.row.nick}</span>
              <span>{compactNumber(slice.row.value)} ({((slice.row.value / total) * 100).toFixed(1)}%)</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (chartType === 'line') {
    const normalizedDailyRows = Array.isArray(dailyRows) ? dailyRows : [];
    const entries = normalizedDailyRows
      .map((row) => ({
        log_date: String(row?.log_date || '').trim(),
        nick: String(row?.nick || '').trim(),
        row_count: toSafeNumber(row?.row_count),
      }))
      .filter((row) => row.log_date !== '' && row.nick !== '' && selectedSet.has(row.nick.toLowerCase()));
    if (entries.length === 0) {
      return <div className="empty-state">No per-day top-nick data available for current nick selection.</div>;
    }

    const dateKeys = Array.from(new Set(entries.map((row) => row.log_date))).sort((a, b) => a.localeCompare(b));
    const dateIndexMap = dateKeys.reduce((acc, dateValue, idx) => {
      acc[dateValue] = idx;
      return acc;
    }, {});
    const nickSeriesMap = selectedRows.reduce((acc, row) => {
      acc[row.nick] = Array(dateKeys.length).fill(0);
      return acc;
    }, {});
    entries.forEach((row) => {
      const idx = dateIndexMap[row.log_date];
      if (!Number.isInteger(idx)) return;
      if (!nickSeriesMap[row.nick]) return;
      nickSeriesMap[row.nick][idx] = row.row_count;
    });
    const width = 960;
    const height = 360;
    const left = 48;
    const right = 16;
    const top = 14;
    const bottom = 42;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const maxValue = Math.max(1, ...Object.values(nickSeriesMap).flatMap((values) => values.map((value) => toSafeNumber(value))));
    const yForValue = (value) => top + ((maxValue - toSafeNumber(value)) / maxValue) * plotHeight;
    const xForIndex = (idx) => {
      if (dateKeys.length <= 1) return left + (plotWidth / 2);
      return left + (idx * (plotWidth / (dateKeys.length - 1)));
    };
    const yBottom = yForValue(0);
    const xTickIndexes = buildAxisTickIndexes(dateKeys.length, 7);
    const yGridTicks = [0, 0.25, 0.5, 0.75, 1];

    return (
      <div className="stats-chart-block">
        <svg className="stats-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Top-nicks line chart over days">
          {yGridTicks.map((ratio) => {
            const y = top + (plotHeight * ratio);
            return <line key={`nick-line-grid-${ratio}`} x1={left} y1={y} x2={left + plotWidth} y2={y} stroke="#1e293b" strokeDasharray="3 4" />;
          })}
          <line x1={left} y1={top} x2={left} y2={yBottom} stroke="#334155" />
          <line x1={left} y1={yBottom} x2={left + plotWidth} y2={yBottom} stroke="#334155" />
          <text x={8} y={yForValue(maxValue) + 4} fill="#94a3b8" fontSize="11">{compactNumber(maxValue)}</text>
          <text x={16} y={yBottom + 4} fill="#94a3b8" fontSize="11">0</text>

          {selectedRows.map((row) => {
            const values = nickSeriesMap[row.nick] || [];
            const points = values.map((value, idx) => `${xForIndex(idx)},${yForValue(value)}`).join(' ');
            return (
              <polyline
                key={`nick-line-${row.nick}`}
                fill="none"
                stroke={colorByNick[row.nick] || '#60a5fa'}
                strokeWidth="2.2"
                points={points}
              />
            );
          })}

          {xTickIndexes.map((idx) => {
            const x = xForIndex(idx);
            const label = formatDateLabel(dateKeys[idx], { includeYear: true });
            return (
              <g key={`nick-line-tick-${idx}`}>
                <line x1={x} y1={yBottom} x2={x} y2={yBottom + 5} stroke="#334155" />
                <text x={x} y={height - 10} fill="#94a3b8" fontSize="10" textAnchor="middle">{label}</text>
              </g>
            );
          })}
        </svg>
        <div className="stats-chart-legend">
          {selectedRows.map((row) => (
            <div key={`line-legend-${row.nick}`} className="stats-chart-legend-row">
              <span className="stats-color-dot" style={{ backgroundColor: colorByNick[row.nick] || '#60a5fa' }} />
              <span>{row.nick}</span>
              <span>{compactNumber(row.value)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const width = 960;
  const height = Math.max(260, selectedRows.length * 32 + 44);
  const left = 180;
  const right = 20;
  const top = 14;
  const bottom = 28;
  const plotWidth = width - left - right;
  const rowHeight = (height - top - bottom) / Math.max(selectedRows.length, 1);
  const maxValue = Math.max(1, ...selectedRows.map((row) => row.value));

  return (
    <svg className="stats-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Top-nicks bar chart">
      <line x1={left} y1={top} x2={left} y2={height - bottom} stroke="#334155" />
      <line x1={left} y1={height - bottom} x2={left + plotWidth} y2={height - bottom} stroke="#334155" />
      {selectedRows.map((row, idx) => {
        const y = top + idx * rowHeight;
        const barY = y + 5;
        const barH = Math.max(rowHeight - 10, 8);
        const barW = (row.value / maxValue) * plotWidth;
        return (
          <g key={`nick-bar-${row.nick}`}>
            <text x={left - 8} y={barY + (barH / 2) + 4} fill="#cbd5e1" fontSize="11" textAnchor="end">{row.nick}</text>
            <rect x={left + 1} y={barY} width={Math.max(barW, 1)} height={barH} fill="#60a5fa" opacity="0.9" />
            <text x={left + barW + 6} y={barY + (barH / 2) + 4} fill="#94a3b8" fontSize="11">{compactNumber(row.value)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function SearchPage() {
  const [mode, setMode] = useState('simple');
  const [resultView, setResultView] = useState('classic');
  const [query, setQuery] = useState('');
  const [queryScope, setQueryScope] = useState('all');
  const [includeTerms, setIncludeTerms] = useState('');
  const [excludeTerms, setExcludeTerms] = useState('');
  const [networkId, setNetworkId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [channelActivityThreshold, setChannelActivityThreshold] = useState(getInitialChannelActivityThreshold());
  const [networks, setNetworks] = useState([]);
  const [channels, setChannels] = useState([]);
  const [networksReady, setNetworksReady] = useState(false);
  const [channelsReady, setChannelsReady] = useState(false);
  const [loadingNetworks, setLoadingNetworks] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [nick, setNick] = useState('');
  const [eventTypes, setEventTypes] = useState([...DEFAULT_ACTIVE_EVENT_TYPES]);
  const [nickSuggestions, setNickSuggestions] = useState([]);
  const [loadingNickSuggestions, setLoadingNickSuggestions] = useState(false);
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
  const [searchSummary, setSearchSummary] = useState(null);
  const [lastSearchQueryString, setLastSearchQueryString] = useState('');
  const [includeQueryInAnchorLinks, setIncludeQueryInAnchorLinks] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statsChartType, setStatsChartType] = useState('bar');
  const [statsShowTotal, setStatsShowTotal] = useState(true);
  const [statsShowChat, setStatsShowChat] = useState(true);
  const [statsShowEvents, setStatsShowEvents] = useState(true);
  const [statsTopNickChartType, setStatsTopNickChartType] = useState('bar');
  const [statsSelectedTopNicks, setStatsSelectedTopNicks] = useState([]);
  const [whoisState, setWhoisState] = useState({
    open: false,
    nick: '',
    loading: false,
    error: '',
    payload: null,
  });
  const channelsRequestSeqRef = useRef(0);
  const channelsCacheRef = useRef(new Map());
  const nickSuggestionSeqRef = useRef(0);
  const searchRequestSeqRef = useRef(0);
  const lastLogCriteriaRef = useRef(null);
  const lastLogResultsRef = useRef(null);
  const readSource = getReadSource();

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

  function hasLoggedActivity(entity) {
    const candidates = [
      entity?.activity_count,
      entity?.event_count,
      entity?.row_count,
      entity?.total_rows,
      entity?.message_count,
      entity?.log_count,
      entity?.entries_count,
    ];

    return candidates.some((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0;
    });
  }

  function canFilterNetworksByActivity(items) {
    return (Array.isArray(items) ? items : []).some((entity) => {
      const candidates = [
        entity?.activity_count,
        entity?.event_count,
        entity?.row_count,
        entity?.total_rows,
        entity?.message_count,
        entity?.log_count,
        entity?.entries_count,
      ];

      return candidates.some((value) => Number.isFinite(Number(value)));
    });
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

  function getChannelById(id) {
    const wanted = String(id || '');
    return channels.find((channel) => String(getEntityId(channel)) === wanted) || null;
  }

  function getChannelDisplayLabel(channel, includeNetwork = !String(networkId || '').trim()) {
    const channelName = getEntityName(channel, 'Channel');
    const networkName = String(channel?.network_name || '').trim();
    return includeNetwork && networkName ? `${channelName} — ${networkName}` : channelName;
  }

  const networkOptions = canFilterNetworksByActivity(networks)
    ? (Array.isArray(networks) ? networks : []).filter((network) => hasLoggedActivity(network))
    : (Array.isArray(networks) ? networks : []);

  const channelOptions = (Array.isArray(channels) ? channels : []).filter((channel) => {
    const activityCount = Number(channel?.event_count ?? channel?.activity_count ?? channel?.row_count ?? channel?.total_rows ?? 0);
    const threshold = normalizeChannelActivityThreshold(channelActivityThreshold);
    if (!Number.isFinite(activityCount) || activityCount <= threshold) {
      return false;
    }
    const filter = String(channelFilter || '').trim().toLowerCase();
    if (!filter) return true;
    const idText = String(getEntityId(channel) || '').toLowerCase();
    const nameText = String(getChannelDisplayLabel(channel) || '').toLowerCase();
    const networkText = String(channel?.network_name || '').toLowerCase();
    return idText.includes(filter) || nameText.includes(filter) || networkText.includes(filter);
  });
  const channelListSize = Math.min(Math.max(channelOptions.length + 1, 8), 18);
  const hasAllEventTypesSelected = EVENT_TYPE_OPTIONS.every((type) => eventTypes.includes(type));
  const availableTopNicks = Array.isArray(results?.top_nicks)
    ? results.top_nicks
      .map((row) => String(row?.nick || '').trim())
      .filter((nickValue) => nickValue !== '')
    : [];
  const selectedTopNicks = (() => {
    const normalizedConfigured = (Array.isArray(statsSelectedTopNicks) ? statsSelectedTopNicks : [])
      .map((item) => String(item || '').trim())
      .filter((item) => item !== '');
    const fromConfigured = normalizedConfigured.filter((nickValue) => availableTopNicks.includes(nickValue));
    if (fromConfigured.length > 0) return fromConfigured;
    return availableTopNicks.slice(0, 8);
  })();

  useEffect(() => {
    if (!channelsReady || !channelId) {
      return;
    }
    const stillVisible = channelOptions.some((channel) => String(getEntityId(channel)) === String(channelId));
    if (!stillVisible) {
      setChannelId('');
      setSimpleDateTimeFrom('');
      setSimpleDateTimeTo('');
      setSimpleMinDateTime('');
      setSimpleMaxDateTime('');
    }
  }, [channelId, channelOptions, channelsReady]);

  function normalizeResultRows(payload, selectedNetworkId = networkId, selectedChannelId = channelId) {
    const rows = extractArray(payload, 'results');
    const selectedChannel = getChannelById(selectedChannelId);
    const selectedNetworkLabel = getNetworkLabelById(selectedNetworkId) || String(selectedChannel?.network_name || '').trim();
    const selectedChannelLabel = getChannelLabelById(selectedChannelId) || String(selectedChannel?.channel_name || selectedChannel?.name || '').trim();
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
    return { from: minValue, to: maxValue };
  }

  async function loadDateRange(selectedNetworkId, selectedChannelId) {
    if (!selectedChannelId) {
      setSimpleDateTimeFrom('');
      setSimpleDateTimeTo('');
      setSimpleMinDateTime('');
      setSimpleMaxDateTime('');
      return { from: '', to: '' };
    }
    const selectedChannel = getChannelById(selectedChannelId);
    const effectiveNetworkId = selectedNetworkId || selectedChannel?.network_id || selectedChannel?.networkId || '';
    const apiKey = getApiKey();
    setLoadingDateRange(true);
    try {
      const range = await getChannelDateRange(apiKey, effectiveNetworkId, selectedChannelId);
      return applyDateRange(range.firstDate || '', range.lastDate || '');
    } catch {
      setSimpleDateTimeFrom('');
      setSimpleDateTimeTo('');
      setSimpleMinDateTime('');
      setSimpleMaxDateTime('');
      return { from: '', to: '' };
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
      const loadedNetworks = extractArray(payload, 'networks');
      setNetworks(loadedNetworks);
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
    const apiKey = getApiKey();
    setLoadingChannels(true);
    setChannelsReady(false);

    function mapChannelRows(rows, fallbackNetworkId) {
      const fallbackNetworkName = String(getNetworkLabelById(fallbackNetworkId) || '').trim();
      return (Array.isArray(rows) ? rows : []).map((channel) => {
        const channelIdValue = channel?.id ?? channel?.channel_id ?? '';
        const channelName = String(channel?.channel_name || channel?.name || '').trim();
        const networkIdValue = Number.parseInt(String(channel?.network_id ?? fallbackNetworkId ?? ''), 10);
        const networkName = String(channel?.network_name || fallbackNetworkName || '').trim();
        return {
          ...channel,
          id: channelIdValue,
          channel_name: channelName,
          name: channelName,
          network_id: Number.isFinite(networkIdValue) ? networkIdValue : fallbackNetworkId,
          network_name: networkName,
          first_date: channel?.first_date || '',
          last_date: channel?.last_date || '',
          event_count: Number(channel?.event_count ?? channel?.row_count ?? channel?.activity_count ?? 0) || 0,
        };
      });
    }

    try {
      let loadedChannels = [];

      if (selectedNetworkId) {
        const cacheKey = String(selectedNetworkId);
        const cachedChannels = channelsCacheRef.current.get(cacheKey);
        if (cachedChannels) {
          loadedChannels = cachedChannels;
        } else {
          const payload = await getNetworkChannelDateIntervals(apiKey, selectedNetworkId);
          if (requestSeq !== channelsRequestSeqRef.current) {
            return;
          }
          loadedChannels = mapChannelRows(extractArray(payload, 'channels'), selectedNetworkId);
          channelsCacheRef.current.set(cacheKey, loadedChannels);
        }
      } else {
        const sourceNetworks = Array.isArray(networkOptions) ? networkOptions : [];
        const networkIds = sourceNetworks
          .map((network) => String(getEntityId(network)))
          .filter((id) => id !== '');
        const channelGroups = await Promise.all(networkIds.map(async (networkIdValue) => {
          const cacheKey = String(networkIdValue);
          const cachedChannels = channelsCacheRef.current.get(cacheKey);
          if (cachedChannels) {
            return cachedChannels;
          }
          const payload = await getNetworkChannelDateIntervals(apiKey, networkIdValue);
          if (requestSeq !== channelsRequestSeqRef.current) {
            return [];
          }
          const rows = mapChannelRows(extractArray(payload, 'channels'), networkIdValue);
          channelsCacheRef.current.set(cacheKey, rows);
          return rows;
        }));
        loadedChannels = channelGroups.flat();
      }

      if (requestSeq !== channelsRequestSeqRef.current) {
        return;
      }

      const nextChannels = loadedChannels
        .slice()
        .sort((a, b) => {
          const networkDiff = String(a.network_name || '').localeCompare(String(b.network_name || ''), undefined, { sensitivity: 'base' });
          if (networkDiff !== 0) return networkDiff;
          return String(a.channel_name || '').localeCompare(String(b.channel_name || ''), undefined, { sensitivity: 'base' });
        });

      setChannels(nextChannels);
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
    const trimmedNick = String(nick || '').trim();
    if (mode !== 'advanced' || trimmedNick.length < 1) {
      setNickSuggestions([]);
      setLoadingNickSuggestions(false);
      return undefined;
    }

    nickSuggestionSeqRef.current += 1;
    const seq = nickSuggestionSeqRef.current;
    setLoadingNickSuggestions(true);
    const timer = setTimeout(async () => {
      try {
        const selectedChannel = getChannelById(channelId);
        const payload = await getNicknames(getApiKey(), trimmedNick, {
          networkId: networkId || selectedChannel?.network_id || '',
          channelId: channelId || '',
          limit: 25,
        });
        if (seq !== nickSuggestionSeqRef.current) return;
        const suggestions = Array.isArray(payload?.nicknames)
          ? payload.nicknames
            .map((item) => ({
              nick: String(item?.nick || '').trim(),
              occurrences: Number(item?.occurrences || 0),
            }))
            .filter((item) => item.nick !== '')
          : [];
        setNickSuggestions(suggestions);
      } catch {
        if (seq !== nickSuggestionSeqRef.current) return;
        setNickSuggestions([]);
      } finally {
        if (seq === nickSuggestionSeqRef.current) {
          setLoadingNickSuggestions(false);
        }
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [mode, nick, networkId, channelId]);

  useEffect(() => {
    setCookieValue(PAGE_SIZE_COOKIE, normalizePageSize(limit));
  }, [limit]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(CHANNEL_ACTIVITY_THRESHOLD_KEY, String(normalizeChannelActivityThreshold(channelActivityThreshold)));
  }, [channelActivityThreshold]);

  useEffect(() => {
    const parsedCriteria = parseCriteriaFromLocation(window.location.search || '');
    setMode(parsedCriteria.mode);
    setResultView(parsedCriteria.resultView);
    setQuery(parsedCriteria.query);
    setQueryScope(normalizeAdvancedQueryScope(parsedCriteria.queryScope));
    setIncludeTerms(parsedCriteria.includeTerms);
    setExcludeTerms(parsedCriteria.excludeTerms);
    setNetworkId(parsedCriteria.networkId);
    setChannelId(parsedCriteria.channelId);
    setSimpleDateTimeFrom(parsedCriteria.simpleDateTimeFrom);
    setSimpleDateTimeTo(parsedCriteria.simpleDateTimeTo);
    setNick(parsedCriteria.nick);
    setDateFrom(parsedCriteria.dateFrom);
    setDateTo(parsedCriteria.dateTo);
    setEventTypes(normalizeEventTypes(parsedCriteria.eventTypes));
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
    if (!networksReady) {
      return;
    }
    loadChannels(networkId, { preserveDateRange: true });
  }, [networksReady]);

  useEffect(() => {
    if (!channelsReady || mode !== 'simple' || !channelId) {
      return;
    }
    if (String(simpleDateTimeFrom || '').trim() || String(simpleDateTimeTo || '').trim()) {
      return;
    }
    loadDateRange(networkId, channelId);
  }, [channelsReady, channelId, mode, simpleDateTimeFrom, simpleDateTimeTo, networkId]);

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
    const requestSeq = searchRequestSeqRef.current + 1;
    searchRequestSeqRef.current = requestSeq;
    const normalizedCriteria = {
      mode: ['simple', 'advanced', 'statistics'].includes(String(criteria?.mode || ''))
        ? String(criteria.mode)
        : 'simple',
      resultView: criteria?.resultView === 'refined' ? 'refined' : 'classic',
      query: String(criteria?.query ?? ''),
      queryScope: normalizeAdvancedQueryScope(criteria?.queryScope ?? 'all'),
      includeTerms: String(criteria?.includeTerms ?? ''),
      excludeTerms: String(criteria?.excludeTerms ?? ''),
      networkId: String(criteria?.networkId ?? ''),
      channelId: String(criteria?.channelId ?? ''),
      simpleDateTimeFrom: String(criteria?.simpleDateTimeFrom ?? ''),
      simpleDateTimeTo: String(criteria?.simpleDateTimeTo ?? ''),
      nick: String(criteria?.nick ?? ''),
      dateFrom: String(criteria?.dateFrom ?? ''),
      dateTo: String(criteria?.dateTo ?? ''),
      eventTypes: normalizeEventTypes(criteria?.eventTypes),
      focusId: String(criteria?.focusId ?? ''),
      limit: Number(criteria?.limit ?? DEFAULT_PAGE_SIZE),
      page: Number(criteria?.page ?? 1),
    };
    const selectedChannel = getChannelById(normalizedCriteria.channelId);
    const effectiveNetworkId = normalizedCriteria.networkId || String(selectedChannel?.network_id || '');
    const shareQueryString = buildSearchParamsFromCriteria(normalizedCriteria);
    setLastSearchQueryString(shareQueryString);
    setSearchSummary(null);
    if (updateUrl) {
      const searchPart = shareQueryString ? `?${shareQueryString}` : '';
      const currentHash = String(window.location.hash || '');
      window.history.replaceState(null, '', `${window.location.pathname}${searchPart}${currentHash}`);
    }

    setLoading(true);
    setError('');
    setResults(null);
    try {
      const trimmedQuery = String(normalizedCriteria.query || '').trim();
      const trimmedIncludeTerms = String(normalizedCriteria.includeTerms || '').trim();
      const trimmedExcludeTerms = String(normalizedCriteria.excludeTerms || '').trim();
      const shouldLoadMiniStats = normalizedCriteria.mode === 'simple'
        && (normalizedCriteria.networkId || normalizedCriteria.channelId || trimmedQuery || trimmedIncludeTerms || trimmedExcludeTerms);
      let miniStatsResolved = false;
      let miniStatsPayload = null;
      const applyMiniStats = (payload) => {
        if (requestSeq !== searchRequestSeqRef.current) return;
        const normalizedSummary = normalizeMiniStats(payload);
        if (!normalizedSummary) return;
        miniStatsPayload = normalizedSummary;
        miniStatsResolved = true;
        if (searchSucceeded) {
          setSearchSummary(normalizedSummary);
        }
      };
      let searchSucceeded = false;
      const miniStatsPromise = shouldLoadMiniStats
        ? getLogStatistics(apiKey, {
          query: normalizedCriteria.query,
          include_terms: normalizedCriteria.includeTerms,
          exclude_terms: normalizedCriteria.excludeTerms,
          network_id: effectiveNetworkId || '',
          channel_id: normalizedCriteria.channelId || '',
          event_types: normalizedCriteria.eventTypes.length > 0 ? normalizedCriteria.eventTypes.join(',') : '',
          datetime_from: normalizedCriteria.simpleDateTimeFrom,
          datetime_to: normalizedCriteria.simpleDateTimeTo,
          date_from: normalizedCriteria.simpleDateTimeFrom ? normalizedCriteria.simpleDateTimeFrom.slice(0, 10) : '',
          date_to: normalizedCriteria.simpleDateTimeTo ? normalizedCriteria.simpleDateTimeTo.slice(0, 10) : '',
        }).then(applyMiniStats).catch(() => null)
        : Promise.resolve(null);

      let data;
      if (normalizedCriteria.mode === 'simple') {
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
          effectiveNetworkId,
          effectiveFrom,
          effectiveTo,
          normalizePageSize(normalizedCriteria.limit),
          Number.isFinite(normalizedCriteria.page) && normalizedCriteria.page >= 1 ? normalizedCriteria.page : 1,
          trimmedIncludeTerms,
          trimmedExcludeTerms,
          normalizedCriteria.eventTypes,
          normalizedCriteria.focusId
        );
        const nextResults = {
          ...data,
          view_mode: normalizedCriteria.mode,
          results: normalizeResultRows(data, effectiveNetworkId, normalizedCriteria.channelId),
        };
        searchSucceeded = true;
        if (requestSeq === searchRequestSeqRef.current && miniStatsResolved && miniStatsPayload) {
          setSearchSummary(miniStatsPayload);
        }
        if (requestSeq !== searchRequestSeqRef.current) return;
        setResults(nextResults);
        lastLogCriteriaRef.current = { ...normalizedCriteria };
        lastLogResultsRef.current = nextResults;
      } else if (normalizedCriteria.mode === 'advanced') {
        const body = {
          query: normalizedCriteria.query,
          query_scope: normalizedCriteria.queryScope,
          include_terms: normalizedCriteria.includeTerms,
          exclude_terms: normalizedCriteria.excludeTerms,
          focus_id: normalizedCriteria.focusId,
          limit: normalizePageSize(normalizedCriteria.limit),
          page: Number.isFinite(normalizedCriteria.page) && normalizedCriteria.page >= 1 ? normalizedCriteria.page : 1,
        };
        if (effectiveNetworkId) body.network_id = Number(effectiveNetworkId);
        if (normalizedCriteria.channelId) body.channel_id = Number(normalizedCriteria.channelId);
        if (normalizedCriteria.nick) body.nick = normalizedCriteria.nick;
        if (normalizedCriteria.dateFrom) body.date_from = normalizedCriteria.dateFrom;
        if (normalizedCriteria.dateTo) body.date_to = normalizedCriteria.dateTo;
        if (normalizedCriteria.eventTypes.length > 0) body.event_types = normalizedCriteria.eventTypes.join(',');
        data = await advancedSearch(apiKey, body);
        const nextResults = {
          ...data,
          view_mode: normalizedCriteria.mode,
          results: normalizeResultRows(data, effectiveNetworkId, normalizedCriteria.channelId),
        };
        if (requestSeq !== searchRequestSeqRef.current) return;
        setResults(nextResults);
        lastLogCriteriaRef.current = { ...normalizedCriteria };
        lastLogResultsRef.current = nextResults;
      } else {
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
        data = await getLogStatistics(apiKey, {
          query: normalizedCriteria.query,
          include_terms: normalizedCriteria.includeTerms,
          exclude_terms: normalizedCriteria.excludeTerms,
          network_id: effectiveNetworkId || '',
          channel_id: normalizedCriteria.channelId || '',
          event_types: normalizedCriteria.eventTypes.length > 0 ? normalizedCriteria.eventTypes.join(',') : '',
          datetime_from: effectiveFrom,
          datetime_to: effectiveTo,
          date_from: effectiveFrom ? effectiveFrom.slice(0, 10) : '',
          date_to: effectiveTo ? effectiveTo.slice(0, 10) : '',
        });
        const nextResults = {
          ...data,
          view_mode: normalizedCriteria.mode,
        };
        if (requestSeq !== searchRequestSeqRef.current) return;
        setResults(nextResults);
      }
      await miniStatsPromise;
    } catch (err) {
      if (requestSeq !== searchRequestSeqRef.current) return;
      setError(err.message);
      setSearchSummary(null);
    } finally {
      if (requestSeq === searchRequestSeqRef.current) {
        setLoading(false);
      }
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
      queryScope,
      includeTerms,
      excludeTerms,
      networkId,
      channelId,
      simpleDateTimeFrom,
      simpleDateTimeTo,
      nick,
      dateFrom,
      dateTo,
      eventTypes,
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
      queryScope,
      includeTerms,
      excludeTerms,
      networkId,
      channelId,
      simpleDateTimeFrom,
      simpleDateTimeTo,
      nick,
      dateFrom,
      dateTo,
      eventTypes,
      limit,
      page: targetPage,
    });
  }

  async function handleSimpleDateCommit(nextFrom, nextTo) {
    if (mode !== 'simple') return;
    if (!hasInteractiveSearchContext({ simpleDateTimeFrom: nextFrom, simpleDateTimeTo: nextTo })) {
      return;
    }

    const firstPage = 1;
    setPage(firstPage);
    await executeCurrentSearch({
      simpleDateTimeFrom: nextFrom,
      simpleDateTimeTo: nextTo,
      page: firstPage,
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

    const nextRange = await loadDateRange(networkId, channelId);
    if (hasInteractiveSearchContext({ simpleDateTimeFrom: nextRange.from, simpleDateTimeTo: nextRange.to })) {
      const firstPage = 1;
      setPage(firstPage);
      await executeCurrentSearch({
        simpleDateTimeFrom: nextRange.from,
        simpleDateTimeTo: nextRange.to,
        page: firstPage,
      });
    }
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

  async function handleNickWhoisClick(rawNick, row = {}) {
    const nickValue = String(rawNick || '').trim();
    if (!nickValue) return;

    setWhoisState({
      open: true,
      nick: nickValue,
      loading: true,
      error: '',
      payload: null,
    });

    try {
      const inferredChannel = getChannelById(row?.channel_id || channelId || '');
      const scope = {
        networkId: row?.network_id || inferredChannel?.network_id || networkId || '',
        channelId: row?.channel_id || channelId || '',
      };
      const [whoisResult, seenResult] = await Promise.allSettled([
        getNickWhois(getApiKey(), nickValue, scope),
        getNickSeen(getApiKey(), nickValue, scope),
      ]);

      const whoisPayload = whoisResult.status === 'fulfilled' && whoisResult.value?.success
        ? whoisResult.value
        : null;
      const seenPayload = seenResult.status === 'fulfilled' && seenResult.value?.success
        ? seenResult.value
        : null;

      if (!whoisPayload && !seenPayload) {
        const whoisError = whoisResult.status === 'fulfilled'
          ? String(whoisResult.value?.error || '')
          : String(whoisResult.reason?.message || '');
        const seenError = seenResult.status === 'fulfilled'
          ? String(seenResult.value?.error || '')
          : String(seenResult.reason?.message || '');
        throw new Error(whoisError || seenError || 'No WHOIS/seen data found.');
      }

      setWhoisState({
        open: true,
        nick: nickValue,
        loading: false,
        error: '',
        payload: {
          whois: whoisPayload,
          seen: seenPayload,
        },
      });
    } catch (err) {
      setWhoisState({
        open: true,
        nick: nickValue,
        loading: false,
        error: String(err?.message || 'Failed to load WHOIS.'),
        payload: null,
      });
    }
  }

  function closeWhoisModal() {
    setWhoisState({
      open: false,
      nick: '',
      loading: false,
      error: '',
      payload: null,
    });
  }

  async function applyEventTypeSelection(nextTypesInput) {
    const normalized = normalizeEventTypes(nextTypesInput);
    const nextTypes = normalized.length > 0 ? normalized : [...DEFAULT_ACTIVE_EVENT_TYPES];
    setEventTypes(nextTypes);
    const hasActiveSearchContext = results !== null
      || String(query || '').trim() !== ''
      || String(includeTerms || '').trim() !== ''
      || String(excludeTerms || '').trim() !== ''
      || mode === 'statistics';
    if (hasActiveSearchContext) {
      const firstPage = 1;
      setPage(firstPage);
      await executeCurrentSearch({
        eventTypes: nextTypes,
        page: firstPage,
      });
    }
  }

  async function toggleEventType(type) {
    const normalizedType = String(type || '').trim().toUpperCase();
    if (!normalizedType) return;
    const existing = normalizeEventTypes(eventTypes);
    const nextTypes = existing.includes(normalizedType)
      ? existing.filter((item) => item !== normalizedType)
      : normalizeEventTypes([...existing, normalizedType]);
    await applyEventTypeSelection(nextTypes);
  }

  function hasInteractiveSearchContext(overrides = {}) {
    const nextMode = String(overrides.mode ?? mode);
    const nextQuery = String(overrides.query ?? query);
    const nextIncludeTerms = String(overrides.includeTerms ?? includeTerms);
    const nextExcludeTerms = String(overrides.excludeTerms ?? excludeTerms);
    const nextChannelId = String(overrides.channelId ?? channelId);
    return results !== null
      || nextQuery.trim() !== ''
      || nextIncludeTerms.trim() !== ''
      || nextExcludeTerms.trim() !== ''
      || nextChannelId.trim() !== ''
      || nextMode === 'statistics';
  }

  function toggleTopNickSelection(nickValue) {
    const target = String(nickValue || '').trim();
    if (!target) return;
    const existing = (Array.isArray(selectedTopNicks) ? selectedTopNicks : []).map((item) => String(item || '').trim());
    if (existing.includes(target)) {
      const next = existing.filter((item) => item !== target);
      setStatsSelectedTopNicks(next);
      return;
    }
    setStatsSelectedTopNicks([...existing, target]);
  }

  async function executeCurrentSearch(overrides = {}) {
    const nextCriteria = {
      mode,
      resultView,
      query,
      queryScope,
      includeTerms,
      excludeTerms,
      networkId,
      channelId,
      simpleDateTimeFrom,
      simpleDateTimeTo,
      nick,
      dateFrom,
      dateTo,
      eventTypes,
      limit,
      page,
      ...overrides,
    };
    await executeSearch(nextCriteria);
  }

  async function handleModeChange(nextMode) {
    const normalizedMode = ['simple', 'advanced', 'statistics'].includes(String(nextMode || ''))
      ? String(nextMode)
      : 'simple';
    const previousMode = mode;
    setMode(normalizedMode);
    const firstPage = 1;
    setPage(firstPage);
    if (normalizedMode === 'statistics') {
      await executeCurrentSearch({ mode: 'statistics', page: firstPage });
      return;
    }

    // Hide statistics output immediately when switching back to log modes.
    setError('');
    const canRestorePreviousLogView = previousMode === 'statistics'
      && lastLogResultsRef.current
      && lastLogCriteriaRef.current
      && lastLogCriteriaRef.current.mode === normalizedMode;
    if (canRestorePreviousLogView) {
      setResults(lastLogResultsRef.current);
    } else {
      setResults(null);
    }

    const fallbackCriteria = {
      mode: normalizedMode,
      resultView,
      query,
      queryScope,
      includeTerms,
      excludeTerms,
      networkId,
      channelId,
      simpleDateTimeFrom,
      simpleDateTimeTo,
      nick,
      dateFrom,
      dateTo,
      eventTypes,
      limit,
      page: firstPage,
    };
    const restoreCriteria = canRestorePreviousLogView
      ? { ...lastLogCriteriaRef.current, mode: normalizedMode, page: firstPage }
      : fallbackCriteria;

    const canAutoLoadSimple = String(restoreCriteria.query || '').trim() !== ''
      || String(restoreCriteria.includeTerms || '').trim() !== ''
      || String(restoreCriteria.excludeTerms || '').trim() !== ''
      || String(restoreCriteria.channelId || '').trim() !== '';
    const canAutoLoad = normalizedMode === 'simple' ? canAutoLoadSimple : true;
    if (!canAutoLoad) {
      const queryString = buildSearchParamsFromCriteria(restoreCriteria);
      setLastSearchQueryString(queryString);
      const searchPart = queryString ? `?${queryString}` : '';
      const currentHash = String(window.location.hash || '');
      window.history.replaceState(null, '', `${window.location.pathname}${searchPart}${currentHash}`);
      return;
    }

    await executeSearch(restoreCriteria);
  }

  return (
    <div className="page">
      <h1>Search IRC Logs</h1>
      <div className="mode-toggle">
        <button
          className={mode === 'simple' ? 'active' : ''}
          onClick={() => handleModeChange('simple')}
        >
          Simple Search
        </button>
        <button
          className={mode === 'advanced' ? 'active' : ''}
          onClick={() => handleModeChange('advanced')}
        >
          Advanced Search
        </button>
        <button
          className={mode === 'statistics' ? 'active' : ''}
          onClick={() => handleModeChange('statistics')}
        >
          Statistics
        </button>
      </div>

      <form onSubmit={handleSearch} className="search-form">
        <div className="form-row">
          <label>Query</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === 'simple' ? 'Optional. Leave empty to open channel logs.' : (mode === 'statistics' ? 'Optional filter for statistics...' : 'Search query...')}
            required={mode === 'advanced' && !String(includeTerms || '').trim() && !String(excludeTerms || '').trim()}
          />
        </div>
        {mode === 'advanced' && (
          <div className="form-row">
            <label>Query field</label>
            <select
              value={queryScope}
              onChange={async (e) => {
                const nextScope = normalizeAdvancedQueryScope(e.target.value);
                setQueryScope(nextScope);
                if (mode === 'advanced' && hasInteractiveSearchContext({ queryScope: nextScope })) {
                  const firstPage = 1;
                  setPage(firstPage);
                  await executeCurrentSearch({
                    queryScope: nextScope,
                    page: firstPage,
                  });
                }
              }}
            >
              {ADVANCED_QUERY_SCOPE_OPTIONS.map((scope) => (
                <option key={scope.value} value={scope.value}>{scope.label}</option>
              ))}
            </select>
          </div>
        )}
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
          <label>Event types (interactive)</label>
          <div className="event-type-preset-row">
            <button
              type="button"
              className={`btn-secondary${eventTypes.length === DEFAULT_ACTIVE_EVENT_TYPES.length && DEFAULT_ACTIVE_EVENT_TYPES.every((type) => eventTypes.includes(type)) ? ' active' : ''}`}
              onClick={() => applyEventTypeSelection(DEFAULT_ACTIVE_EVENT_TYPES)}
            >
              Chat only (PRIVMSG + ACTION)
            </button>
            <button
              type="button"
              className={`btn-secondary${hasAllEventTypesSelected ? ' active' : ''}`}
              onClick={() => applyEventTypeSelection(EVENT_TYPE_OPTIONS)}
            >
              All event types
            </button>
          </div>
          <div className="event-type-toggle-list">
            {EVENT_TYPE_OPTIONS.map((type) => {
              const isActive = eventTypes.includes(type);
              return (
                <button
                  key={`toggle-${type}`}
                  type="button"
                  className={`event-type-toggle${isActive ? ' is-active' : ''}`}
                  onClick={() => toggleEventType(type)}
                >
                  {type}
                </button>
              );
            })}
          </div>
        </div>
        <div className="form-row">
          <label>Network (optional)</label>
          <select
            value={networkId}
            onChange={async (e) => {
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
              await loadChannels(selected);
              const canAutoLoadSimple = String(query || '').trim() !== ''
                || String(includeTerms || '').trim() !== ''
                || String(excludeTerms || '').trim() !== '';
              const canAutoLoad = mode === 'simple' ? canAutoLoadSimple : true;
              if (canAutoLoad && hasInteractiveSearchContext({ networkId: selected, channelId: '' })) {
                const firstPage = 1;
                setPage(firstPage);
                await executeCurrentSearch({
                  networkId: selected,
                  channelId: '',
                  simpleDateTimeFrom: '',
                  simpleDateTimeTo: '',
                  page: firstPage,
                });
              }
            }}
            disabled={loadingNetworks || !networksReady}
          >
            <option value="">
              {loadingNetworks ? 'Loading networks...' : (networksReady ? 'All networks' : 'Networks unavailable')}
            </option>
            {networkOptions.map((network) => (
              <option key={String(getEntityId(network))} value={String(getEntityId(network))}>
                {getEntityName(network, 'Network')}
              </option>
            ))}
          </select>
          {loadingNetworks && <small className="loading-hint"><span className="loading-spinner" />Loading networks...</small>}
        </div>
        <div className="form-row">
          <label>Channel list minimum activity</label>
          <input
            type="number"
            min="30"
            step="1"
            value={channelActivityThreshold}
            onChange={(e) => setChannelActivityThreshold(e.target.value)}
            onBlur={(e) => setChannelActivityThreshold(String(normalizeChannelActivityThreshold(e.target.value)))}
            placeholder="30"
          />
          <small>Only channels with at least this many messages/actions are listed.</small>
        </div>
        <div className="form-row">
          <label>Channel (optional)</label>
          <input
            type="text"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            placeholder={networkId ? 'Filter channels (name or id)...' : 'Filter channels (name, id or network)...'}
            disabled={loadingNetworks || !networksReady || loadingChannels || !channelsReady}
          />
          <select
            className="channel-selectbox"
            size={channelListSize}
            value={channelId}
            onChange={async (e) => {
              const selected = e.target.value;
              setChannelId(selected);
              let nextRange = { from: '', to: '' };
              const selectedChannel = channels.find((channel) => String(getEntityId(channel)) === String(selected));
              const first = selectedChannel?.first_date || selectedChannel?.firstDate || '';
              const last = selectedChannel?.last_date || selectedChannel?.lastDate || '';
              if (first || last) {
                nextRange = applyDateRange(first, last);
              } else {
                nextRange = await loadDateRange(networkId, selected);
              }

              const hasActiveSearchContext = results !== null
                || String(query || '').trim() !== ''
                || String(includeTerms || '').trim() !== ''
                || String(excludeTerms || '').trim() !== ''
                || mode === 'statistics';
              if (hasActiveSearchContext) {
                const firstPage = 1;
                setPage(firstPage);
                await executeCurrentSearch({
                  channelId: selected,
                  simpleDateTimeFrom: nextRange.from,
                  simpleDateTimeTo: nextRange.to,
                  page: firstPage,
                });
              }
            }}
            disabled={loadingNetworks || !networksReady || loadingChannels || !channelsReady}
          >
            <option value="">
              {loadingChannels
                ? 'Loading channels...'
                : (networkId ? (channelsReady ? 'All channels in selected network' : 'Loading channels...') : 'All channels across all networks')}
            </option>
            {channelOptions.map((channel) => (
              <option key={String(getEntityId(channel))} value={String(getEntityId(channel))}>
                {getChannelDisplayLabel(channel, !networkId)}
              </option>
            ))}
          </select>
          {networkId && loadingChannels && <small className="loading-hint"><span className="loading-spinner" />Loading channels...</small>}
          {!loadingChannels && channels.length === 0 && <small>No channels found.</small>}
          {!loadingChannels && channels.length > 0 && channelOptions.length === 0 && <small>No channels match your filter or activity threshold.</small>}
          {!loadingChannels && channels.length > 0 && channelOptions.length > 0 && (
            <small>{channelOptions.length} channels available{networkId ? ' in selected network' : ' across all networks'}.</small>
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
              onChange={async (e) => {
                const nextValue = e.target.value;
                setSimpleDateTimeFrom(nextValue);
                await handleSimpleDateCommit(nextValue, simpleDateTimeTo);
              }}
              min={simpleMinDateTime || undefined}
              max={simpleMaxDateTime || undefined}
              disabled={!channelId || loadingDateRange}
            />
            <input
              type="datetime-local"
              value={simpleDateTimeTo}
              onChange={async (e) => {
                const nextValue = e.target.value;
                setSimpleDateTimeTo(nextValue);
                await handleSimpleDateCommit(simpleDateTimeFrom, nextValue);
              }}
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
              {loadingNickSuggestions && <small className="loading-hint"><span className="loading-spinner" />Searching nicknames...</small>}
              {!loadingNickSuggestions && nickSuggestions.length > 0 && (
                <div className="nick-suggestion-list" role="listbox" aria-label="Nickname suggestions">
                  {nickSuggestions.map((item) => (
                    <button
                      key={`nick-suggestion-${item.nick}`}
                      type="button"
                      className="nick-suggestion-item"
                      onClick={async () => {
                        setNick(item.nick);
                        setNickSuggestions([]);
                        if (mode === 'advanced') {
                          const firstPage = 1;
                          setPage(firstPage);
                          await executeCurrentSearch({
                            nick: item.nick,
                            page: firstPage,
                          });
                        }
                      }}
                    >
                      <span className="nick-suggestion-name">{item.nick}</span>
                      {item.occurrences > 0 && <span className="nick-suggestion-meta">{item.occurrences}</span>}
                    </button>
                  ))}
                </div>
              )}
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
            onChange={async (e) => {
              const nextLimit = normalizePageSize(e.target.value);
              setLimit(nextLimit);
              const firstPage = 1;
              setPage(firstPage);
              if (hasInteractiveSearchContext({ limit: nextLimit, page: firstPage })) {
                await executeCurrentSearch({
                  limit: nextLimit,
                  page: firstPage,
                });
              }
            }}
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={String(option)}>{option}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Loading…' : (mode === 'statistics' ? 'Load statistics' : (mode === 'simple' && !String(query || '').trim() ? (String(channelId || '').trim() ? 'Open channel' : (String(networkId || '').trim() ? 'Open network' : 'Open all channels')) : 'Search'))}
        </button>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {searchSummary && (!results || results.view_mode !== 'statistics') && (
        <div className="stats-panel">
          <div className="stats-grid">
            <div className="stats-card"><div className="stats-label">Posts</div><div className="stats-value">{Number(searchSummary.totalRows || 0).toLocaleString()}</div></div>
            <div className="stats-card"><div className="stats-label">Nicks</div><div className="stats-value">{Number(searchSummary.uniqueNicks || 0).toLocaleString()}</div></div>
            <div className="stats-card"><div className="stats-label">Dates</div><div className="stats-value">{Number(searchSummary.uniqueDates || 0).toLocaleString()}</div></div>
            <div className="stats-card"><div className="stats-label">Chat texts</div><div className="stats-value">{Number(searchSummary.chatRowsTotal || 0).toLocaleString()}</div></div>
            <div className="stats-card"><div className="stats-label">Channel events</div><div className="stats-value">{Number(searchSummary.channelEventRowsTotal || 0).toLocaleString()}</div></div>
            <div className="stats-card"><div className="stats-label">Loaded</div><div className="stats-value">{loading ? '…' : 'Ready'}</div></div>
          </div>
          {(searchSummary.firstSeen || searchSummary.lastSeen) && (
            <small>{searchSummary.firstSeen || 'n/a'} → {searchSummary.lastSeen || 'n/a'}</small>
          )}
        </div>
      )}

      {results && (
        <div className="results">
          {results.view_mode === 'statistics' && (
            <div className="stats-panel">
              <div className="stats-grid">
                <div className="stats-card"><div className="stats-label">Total rows</div><div className="stats-value">{Number(results.total_rows || 0).toLocaleString()}</div></div>
                <div className="stats-card"><div className="stats-label">Unique dates</div><div className="stats-value">{Number(results.unique_dates || 0).toLocaleString()}</div></div>
                <div className="stats-card"><div className="stats-label">First seen</div><div className="stats-value">{String(results.first_occurred_at || 'n/a')}</div></div>
                <div className="stats-card"><div className="stats-label">Last seen</div><div className="stats-value">{String(results.last_occurred_at || 'n/a')}</div></div>
                <div className="stats-card"><div className="stats-label">Chat texts</div><div className="stats-value">{Number(results.chat_rows_total || 0).toLocaleString()}</div></div>
                <div className="stats-card"><div className="stats-label">Channel events</div><div className="stats-value">{Number(results.channel_event_rows_total || 0).toLocaleString()}</div></div>
              </div>

              {(() => {
                const dailyRows = buildDailyRows(results);
                return (
                  <div className="stats-section stats-chart-section">
                    <h3>Daily activity chart</h3>
                    <div className="stats-chart-controls">
                      <div className="stats-chart-type">
                        <button
                          type="button"
                          className={`btn-secondary${statsChartType === 'bar' ? ' active' : ''}`}
                          onClick={() => setStatsChartType('bar')}
                        >
                          Bar
                        </button>
                        <button
                          type="button"
                          className={`btn-secondary${statsChartType === 'line' ? ' active' : ''}`}
                          onClick={() => setStatsChartType('line')}
                        >
                          Line
                        </button>
                        <button
                          type="button"
                          className={`btn-secondary${statsChartType === 'pie' ? ' active' : ''}`}
                          onClick={() => setStatsChartType('pie')}
                        >
                          Pie
                        </button>
                      </div>
                      <div className="stats-series-toggle">
                        <label><input type="checkbox" checked={statsShowChat} onChange={(e) => setStatsShowChat(Boolean(e.target.checked))} /> Chat texts</label>
                        <label><input type="checkbox" checked={statsShowEvents} onChange={(e) => setStatsShowEvents(Boolean(e.target.checked))} /> Channel events</label>
                        <label><input type="checkbox" checked={statsShowTotal} onChange={(e) => setStatsShowTotal(Boolean(e.target.checked))} /> Total</label>
                      </div>
                    </div>
                    <StatsDailyChart
                      rows={dailyRows}
                      chartType={statsChartType}
                      showTotal={statsShowTotal}
                      showChat={statsShowChat}
                      showEvents={statsShowEvents}
                    />
                  </div>
                );
              })()}

              <div className="stats-section stats-chart-section">
                <h3>Top-nicks chart</h3>
                <div className="stats-chart-controls">
                  <div className="stats-chart-type">
                    <button
                      type="button"
                      className={`btn-secondary${statsTopNickChartType === 'bar' ? ' active' : ''}`}
                      onClick={() => setStatsTopNickChartType('bar')}
                    >
                      Bar
                    </button>
                    <button
                      type="button"
                      className={`btn-secondary${statsTopNickChartType === 'line' ? ' active' : ''}`}
                      onClick={() => setStatsTopNickChartType('line')}
                    >
                      Line
                    </button>
                    <button
                      type="button"
                      className={`btn-secondary${statsTopNickChartType === 'pie' ? ' active' : ''}`}
                      onClick={() => setStatsTopNickChartType('pie')}
                    >
                      Pie
                    </button>
                  </div>
                  <div className="stats-series-toggle">
                    <button type="button" className="btn-secondary" onClick={() => setStatsSelectedTopNicks(availableTopNicks.slice(0, 8))}>
                      Top 8
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setStatsSelectedTopNicks([...availableTopNicks])}>
                      All
                    </button>
                  </div>
                </div>
                <div className="event-type-toggle-list">
                  {availableTopNicks.map((nickValue) => (
                    <button
                      key={`top-nick-toggle-${nickValue}`}
                      type="button"
                      className={`event-type-toggle${selectedTopNicks.includes(nickValue) ? ' is-active' : ''}`}
                      onClick={() => toggleTopNickSelection(nickValue)}
                    >
                      {nickValue}
                    </button>
                  ))}
                </div>
                <StatsTopNicksChart
                  rows={Array.isArray(results.top_nicks) ? results.top_nicks : []}
                  dailyRows={Array.isArray(results.daily_top_nicks) ? results.daily_top_nicks : []}
                  selectedNicks={selectedTopNicks}
                  chartType={statsTopNickChartType}
                />
              </div>

              <div className="stats-sections">
                <div className="stats-section">
                  <h3>Event type counts</h3>
                  {Array.isArray(results.event_type_counts) && results.event_type_counts.length > 0 ? (
                    <div className="stats-list">
                      {results.event_type_counts.map((row) => (
                        <div key={`etype-${row.event_type}`} className="stats-list-row">
                          <span>{String(row.event_type || 'UNKNOWN')}</span>
                          <span>{Number(row.row_count || 0).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p>No event type data.</p>}
                </div>
                <div className="stats-section">
                  <h3>Top nicks</h3>
                  {Array.isArray(results.top_nicks) && results.top_nicks.length > 0 ? (
                    <div className="stats-list">
                      {results.top_nicks.map((row) => (
                        <div key={`nick-${row.nick}`} className="stats-list-row">
                          <span>{String(row.nick || '?')}</span>
                          <span>{Number(row.row_count || 0).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p>No nick data.</p>}
                </div>
              </div>
            </div>
          )}
          {results.view_mode !== 'statistics' && (
            <>
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
              <label className="anchor-link-toggle" title="Include q/query search terms in # anchors">
                <input
                  type="checkbox"
                  checked={includeQueryInAnchorLinks}
                  onChange={(e) => setIncludeQueryInAnchorLinks(Boolean(e.target.checked))}
                />
                <span>Include q/query in # links</span>
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
                String(row.event_type || '').toUpperCase() === 'MODE_BULK'
                  ? <BulkEventCard key={rowKey} result={row} variant={resultView} showNetwork={!String(networkId || '').trim()} shareSearchQueryString={lastSearchQueryString} includeSearchInAnchor={includeQueryInAnchorLinks} onNickClick={handleNickWhoisClick} />
                  : (resultView === 'classic'
                    ? <ClassicResultRow key={rowKey} result={row} showNetwork={!String(networkId || '').trim()} shareSearchQueryString={lastSearchQueryString} includeSearchInAnchor={includeQueryInAnchorLinks} onNickClick={handleNickWhoisClick} />
                    : <RefinedResultRow key={rowKey} result={row} shareSearchQueryString={lastSearchQueryString} includeSearchInAnchor={includeQueryInAnchorLinks} onNickClick={handleNickWhoisClick} />)
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
            </>
          )}
        </div>
      )}
      {whoisState.open && (
        <div className="whois-overlay" onClick={closeWhoisModal}>
          <div className="whois-modal" onClick={(e) => e.stopPropagation()}>
            <div className="whois-header">
              <h2>WHOIS: {whoisState.nick || '?'}</h2>
              <button type="button" className="btn-secondary" onClick={closeWhoisModal}>Close</button>
            </div>
            {whoisState.loading && <div className="whois-body">Loading…</div>}
            {!whoisState.loading && whoisState.error && <div className="whois-body whois-error">{whoisState.error}</div>}
            {!whoisState.loading && !whoisState.error && (
              <div className="whois-body">
                {!whoisState.payload?.seen?.found && !whoisState.payload?.whois?.found && (
                  <div>No WHOIS/seen entry found for this nick in current scope.</div>
                )}
                {whoisState.payload?.seen?.found && (
                  <div className="whois-section">
                    <div className="whois-section-title">Seen activity</div>
                    <div><strong>First seen:</strong> {String(whoisState.payload.seen.first_seen_at || 'n/a')}</div>
                    <div><strong>Last seen:</strong> {String(whoisState.payload.seen.last_seen_at || 'n/a')}</div>
                    <div><strong>Total rows:</strong> {Number(whoisState.payload.seen.total_rows || 0).toLocaleString()}</div>
                    <div><strong>Active dates:</strong> {Number(whoisState.payload.seen.unique_dates || 0).toLocaleString()}</div>
                    {whoisState.payload.seen.viewer_url && (
                      <div>
                        <a href={getPermalinkUrl(whoisState.payload.seen.viewer_url)} target="_blank" rel="noopener noreferrer" className="permalink">
                          Open in viewer ↗
                        </a>
                      </div>
                    )}
                    {Array.isArray(whoisState.payload.seen.event_type_counts) && whoisState.payload.seen.event_type_counts.length > 0 && (
                      <div className="whois-activity-list">
                        {whoisState.payload.seen.event_type_counts.slice(0, 8).map((row) => (
                          <div key={`seen-type-${row.event_type}`} className="whois-activity-row">
                            <span>{String(row.event_type || 'UNKNOWN')}</span>
                            <span>{Number(row.row_count || 0).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {whoisState.payload?.whois?.latest_activity && (
                  <div className="whois-section">
                    <div className="whois-section-title">Latest activity</div>
                    <div><strong>Time:</strong> {String(whoisState.payload.whois.latest_activity.occurred_at || 'n/a')}</div>
                    <div><strong>Type:</strong> {String(whoisState.payload.whois.latest_activity.event_type || 'n/a')}</div>
                    <div>
                      <strong>User/host:</strong>{' '}
                      {String([
                        whoisState.payload.whois.latest_activity.user || '',
                        whoisState.payload.whois.latest_activity.host || '',
                      ].filter(Boolean).join('@') || 'n/a')}
                    </div>
                    <div><strong>Channel:</strong> {String(whoisState.payload.whois.latest_activity.channel_name || 'n/a')}</div>
                  </div>
                )}
                {whoisState.payload?.whois?.whois && (
                  <div className="whois-section">
                    <div className="whois-section-title">WHOIS metadata</div>
                    <div><strong>Time:</strong> {String(whoisState.payload.whois.whois.occurred_at || 'n/a')}</div>
                    <div><strong>Type:</strong> {String(whoisState.payload.whois.whois.event_type || 'n/a')}</div>
                    <div><strong>to_nick:</strong> {String(whoisState.payload.whois.whois.to_nick || 'n/a')}</div>
                    <div className="whois-raw-line">{String(whoisState.payload.whois.whois.raw_line || whoisState.payload.whois.whois.event_text || whoisState.payload.whois.whois.message_text || '')}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
