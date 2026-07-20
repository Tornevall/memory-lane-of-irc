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

function getApiKey() {
  return localStorage.getItem('irc_api_key') || '';
}

function ResultRow({ result }) {
  return (
    <div className="result-row">
      <div className="result-meta">
        <span className="nick">{result.nick}</span>
        <span className="channel">{result.channel}</span>
        <span className="network">{result.network}</span>
        <span className="date">{new Date(result.occurred_at).toLocaleString()}</span>
      </div>
      <div className="result-message">{result.message}</div>
      {result.permalink && (
        <a
          href={getPermalinkUrl(result.permalink)}
          target="_blank"
          rel="noopener noreferrer"
          className="permalink"
        >
          Permalink ↗
        </a>
      )}
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
  const [query, setQuery] = useState('');
  const [networkId, setNetworkId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [networks, setNetworks] = useState([]);
  const [channels, setChannels] = useState([]);
  const [networksReady, setNetworksReady] = useState(false);
  const [channelsReady, setChannelsReady] = useState(false);
  const [loadingNetworks, setLoadingNetworks] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [nick, setNick] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [limit, setLimit] = useState(50);
  const [page, setPage] = useState(1);
  const [simpleDateTimeFrom, setSimpleDateTimeFrom] = useState('');
  const [simpleDateTimeTo, setSimpleDateTimeTo] = useState('');
  const [simpleMinDateTime, setSimpleMinDateTime] = useState('');
  const [simpleMaxDateTime, setSimpleMaxDateTime] = useState('');
  const [loadingDateRange, setLoadingDateRange] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const channelsRequestSeqRef = useRef(0);
  const channelsCacheRef = useRef(new Map());
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

  function normalizeResultRows(payload) {
    const rows = extractArray(payload, 'results');
    const selectedNetworkLabel = getNetworkLabelById(networkId);
    const selectedChannelLabel = getChannelLabelById(channelId);
    return rows.map((row) => ({
      ...row,
      message: row.message ?? row.message_text ?? row.event_text ?? '',
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

  async function loadChannels(selectedNetworkId) {
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
      setSimpleDateTimeFrom('');
      setSimpleDateTimeTo('');
      setSimpleMinDateTime('');
      setSimpleMaxDateTime('');
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

  async function handleSearch(e) {
    e.preventDefault();
    const apiKey = getApiKey();
    setLoading(true);
    setError('');
    setResults(null);
    try {
      let data;
      if (mode === 'simple') {
        const trimmedQuery = String(query || '').trim();
        if (!trimmedQuery && !channelId) {
          throw new Error('Choose a channel to open chat logs directly, or enter a query.');
        }
        const effectiveFrom = simpleDateTimeFrom && simpleDateTimeTo && simpleDateTimeFrom > simpleDateTimeTo ? simpleDateTimeTo : simpleDateTimeFrom;
        const effectiveTo = simpleDateTimeFrom && simpleDateTimeTo && simpleDateTimeFrom > simpleDateTimeTo ? simpleDateTimeFrom : simpleDateTimeTo;
        data = await simpleSearch(apiKey, trimmedQuery, channelId, networkId, effectiveFrom, effectiveTo);
      } else {
        const body = { query, limit: Number(limit), page: Number(page) };
        if (networkId) body.network_id = Number(networkId);
        if (channelId) body.channel_id = Number(channelId);
        if (nick) body.nick = nick;
        if (dateFrom) body.date_from = dateFrom;
        if (dateTo) body.date_to = dateTo;
        data = await advancedSearch(apiKey, body);
      }
      setResults({
        ...data,
        results: normalizeResultRows(data),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
            required={mode !== 'simple'}
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
            {channels.map((channel) => (
              <option key={String(getEntityId(channel))} value={String(getEntityId(channel))}>
                {getEntityName(channel, 'Channel')}
              </option>
            ))}
          </select>
          {networkId && loadingChannels && <small className="loading-hint"><span className="loading-spinner" />Loading channels...</small>}
          {networkId && !loadingChannels && channels.length === 0 && <small>No channels found for selected network.</small>}
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
            <div className="form-row">
              <label>Limit (max 1000)</label>
              <input
                type="number"
                value={limit}
                min={1}
                max={1000}
                onChange={(e) => setLimit(e.target.value)}
              />
            </div>
            <div className="form-row">
              <label>Page</label>
              <input
                type="number"
                value={page}
                min={1}
                onChange={(e) => setPage(e.target.value)}
              />
            </div>
          </>
        )}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Loading…' : (mode === 'simple' && !String(query || '').trim() ? 'Open channel' : 'Search')}
        </button>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {results && (
        <div className="results">
          <div className="results-header">
            Found {results.total ?? results.results?.length ?? 0} results
            {results.page && ` (page ${results.page})`}
          </div>
          {results.results?.length === 0 && <p>No results found.</p>}
          {results.results?.map((r) => (
            <ResultRow key={r.id} result={r} />
          ))}
        </div>
      )}
    </div>
  );
}
