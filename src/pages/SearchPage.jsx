import { useEffect, useState } from 'react';
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

export default function SearchPage() {
  const [mode, setMode] = useState('simple');
  const [query, setQuery] = useState('');
  const [networkId, setNetworkId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [networks, setNetworks] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loadingNetworks, setLoadingNetworks] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [nick, setNick] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [limit, setLimit] = useState(50);
  const [page, setPage] = useState(1);
  const [simpleDateFrom, setSimpleDateFrom] = useState('');
  const [simpleDateTo, setSimpleDateTo] = useState('');
  const [simpleMinDate, setSimpleMinDate] = useState('');
  const [simpleMaxDate, setSimpleMaxDate] = useState('');
  const [loadingDateRange, setLoadingDateRange] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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
    const first = firstDate || '';
    const last = lastDate || '';
    setSimpleMinDate(first);
    setSimpleMaxDate(last);
    setSimpleDateFrom((current) => {
      if (!current) return '';
      if (first && current < first) return first;
      if (last && current > last) return last;
      return current;
    });
    setSimpleDateTo((current) => {
      if (!current) return '';
      if (first && current < first) return first;
      if (last && current > last) return last;
      return current;
    });
  }

  async function loadDateRange(selectedNetworkId, selectedChannelId) {
    if (!selectedChannelId) {
      setSimpleDateFrom('');
      setSimpleDateTo('');
      setSimpleMinDate('');
      setSimpleMaxDate('');
      return;
    }
    const apiKey = getApiKey();
    setLoadingDateRange(true);
    try {
      const range = await getChannelDateRange(apiKey, selectedNetworkId, selectedChannelId);
      applyDateRange(range.firstDate || '', range.lastDate || '');
    } catch {
      setSimpleDateFrom('');
      setSimpleDateTo('');
      setSimpleMinDate('');
      setSimpleMaxDate('');
    } finally {
      setLoadingDateRange(false);
    }
  }

  async function loadNetworks() {
    const apiKey = getApiKey();
    setLoadingNetworks(true);
    try {
      const payload = await getNetworks(apiKey);
      setNetworks(extractArray(payload, 'networks'));
    } catch (err) {
      setError(err.message || 'Failed to load networks.');
    } finally {
      setLoadingNetworks(false);
    }
  }

  async function loadChannels(selectedNetworkId) {
    if (!selectedNetworkId) {
      setChannels([]);
      return;
    }
    const apiKey = getApiKey();
    setLoadingChannels(true);
    try {
      const payload = await getNetworkChannels(apiKey, selectedNetworkId);
      const loadedChannels = extractArray(payload, 'channels');
      setChannels(loadedChannels);
      setSimpleDateFrom('');
      setSimpleDateTo('');
      setSimpleMinDate('');
      setSimpleMaxDate('');
    } catch (err) {
      setError(err.message || 'Failed to load channels.');
      setChannels([]);
      setSimpleDateFrom('');
      setSimpleDateTo('');
      setSimpleMinDate('');
      setSimpleMaxDate('');
    } finally {
      setLoadingChannels(false);
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
        const effectiveFrom = simpleDateFrom && simpleDateTo && simpleDateFrom > simpleDateTo ? simpleDateTo : simpleDateFrom;
        const effectiveTo = simpleDateFrom && simpleDateTo && simpleDateFrom > simpleDateTo ? simpleDateFrom : simpleDateTo;
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
              setSimpleDateFrom('');
              setSimpleDateTo('');
              setSimpleMinDate('');
              setSimpleMaxDate('');
              loadChannels(selected);
            }}
          >
            <option value="">All networks</option>
            {networks.map((network) => (
              <option key={String(getEntityId(network))} value={String(getEntityId(network))}>
                {getEntityName(network, 'Network')}
              </option>
            ))}
          </select>
          {loadingNetworks && <small>Loading networks...</small>}
        </div>
        <div className="form-row">
          <label>Channel (optional)</label>
          <select
            value={channelId}
            onChange={(e) => {
              const selected = e.target.value;
              setChannelId(selected);
              const selectedChannel = channels.find((channel) => String(getEntityId(channel)) === String(selected));
              const first = selectedChannel?.first_date || selectedChannel?.firstDate || '';
              const last = selectedChannel?.last_date || selectedChannel?.lastDate || '';
              if (first || last) {
                applyDateRange(first, last);
              } else {
                loadDateRange(networkId, selected);
              }
            }}
            disabled={Boolean(networkId) && loadingChannels}
          >
            <option value="">All channels</option>
            {channels.map((channel) => (
              <option key={String(getEntityId(channel))} value={String(getEntityId(channel))}>
                {getEntityName(channel, 'Channel')}
              </option>
            ))}
          </select>
          {networkId && loadingChannels && <small>Loading channels...</small>}
          {!loadingChannels && channelId && (
            <small>Reading from: {readSource}</small>
          )}
        </div>
        {mode === 'simple' && (
          <div className="form-row">
            <label>Date range (optional)</label>
            <input
              type="date"
              value={simpleDateFrom}
              onChange={(e) => setSimpleDateFrom(e.target.value)}
              min={simpleMinDate || undefined}
              max={simpleMaxDate || undefined}
              disabled={Boolean(channelId) && loadingDateRange}
            />
            <input
              type="date"
              value={simpleDateTo}
              onChange={(e) => setSimpleDateTo(e.target.value)}
              min={simpleMinDate || undefined}
              max={simpleMaxDate || undefined}
              disabled={Boolean(channelId) && loadingDateRange}
            />
            {channelId && loadingDateRange && <small>Loading date range...</small>}
            {channelId && !loadingDateRange && (simpleMinDate || simpleMaxDate) && (
              <small>
                Available range: {simpleMinDate || '...'} to {simpleMaxDate || '...'}
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
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="form-row">
              <label>Date To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
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
