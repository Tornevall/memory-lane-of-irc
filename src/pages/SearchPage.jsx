import { useState } from 'react';
import { simpleSearch, advancedSearch } from '../services/api';

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
          href={`https://tools.tornevall.com${result.permalink}`}
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
  const [channelId, setChannelId] = useState('');
  const [nick, setNick] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [limit, setLimit] = useState(50);
  const [page, setPage] = useState(1);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSearch(e) {
    e.preventDefault();
    const apiKey = getApiKey();
    setLoading(true);
    setError('');
    setResults(null);
    try {
      let data;
      if (mode === 'simple') {
        data = await simpleSearch(apiKey, query, channelId);
      } else {
        const body = { query, limit: Number(limit), page: Number(page) };
        if (channelId) body.channel_id = Number(channelId);
        if (nick) body.nick = nick;
        if (dateFrom) body.date_from = dateFrom;
        if (dateTo) body.date_to = dateTo;
        data = await advancedSearch(apiKey, body);
      }
      setResults(data);
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
            placeholder="Search query..."
            required
          />
        </div>
        <div className="form-row">
          <label>Channel ID (optional)</label>
          <input
            type="number"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder="e.g. 123"
          />
        </div>
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
          {loading ? 'Searching…' : 'Search'}
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
