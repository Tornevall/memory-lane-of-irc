import { useState, useEffect } from 'react';
import { getHighlights, createHighlight } from '../services/api';
import { hasWriteAccess, isTrustedNoKeyHost } from '../services/authMode';

function getApiKey() {
  return localStorage.getItem('irc_api_key') || '';
}

export default function HighlightsPage() {
  const [apiKey, setApiKey] = useState(getApiKey());
  const trustedNoKeyHost = isTrustedNoKeyHost();
  const canWrite = hasWriteAccess(apiKey);
  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [logEventId, setLogEventId] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  async function fetchHighlights() {
    setLoading(true);
    setError('');
    try {
      const data = await getHighlights(apiKey);
      setHighlights(data.highlights || []);
    } catch (err) {
      const msg = String(err.message || '');
      if (!apiKey && /auth|required|unauthorized|forbidden/i.test(msg)) {
        setError('Read access denied by backend for anonymous mode.');
        setHighlights([]);
      } else {
        setError(msg || 'Failed to fetch highlights.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchHighlights();
  }, [apiKey]);

  useEffect(() => {
    const syncApiKey = () => setApiKey(getApiKey());
    window.addEventListener('irc-api-key-changed', syncApiKey);
    return () => window.removeEventListener('irc-api-key-changed', syncApiKey);
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!canWrite) {
      setCreateError('Readonly mode active. Add API key to create highlights/comments.');
      return;
    }
    setCreating(true);
    setCreateError('');
    setCreateSuccess('');
    try {
      const data = await createHighlight(apiKey, {
        log_event_id: Number(logEventId),
        title,
        note,
        is_public: isPublic,
      });
      setCreateSuccess(`Highlight created! ID: ${data.id}`);
      setLogEventId('');
      setTitle('');
      setNote('');
      setShowForm(false);
      fetchHighlights();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Highlights</h1>
        <button
          className="btn-primary"
          onClick={() => setShowForm(!showForm)}
          disabled={!canWrite}
          title={!canWrite ? 'Readonly mode: add API key for write access.' : ''}
        >
          {showForm ? 'Cancel' : '+ New Highlight'}
        </button>
      </div>

      {!canWrite && (
        <div className="readonly-banner">
          Readonly mode: browsing is allowed. Add API key for writing highlights/comments.
        </div>
      )}
      {trustedNoKeyHost && !apiKey && (
        <div className="success-banner">
          Trusted host mode active: API key is not required on this host.
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="search-form highlight-form">
          <h2>Create Highlight</h2>
          <div className="form-row">
            <label>Log Event ID *</label>
            <input
              type="number"
              value={logEventId}
              onChange={(e) => setLogEventId(e.target.value)}
              placeholder="e.g. 12345"
              required
            />
          </div>
          <div className="form-row">
            <label>Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Funny quote"
              required
            />
          </div>
          <div className="form-row">
            <label>Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Additional notes..."
              rows={3}
            />
          </div>
          <div className="form-row checkbox-row">
            <label>
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              Public highlight
            </label>
          </div>
          {createError && <div className="error-banner">{createError}</div>}
          {createSuccess && <div className="success-banner">{createSuccess}</div>}
          <button type="submit" className="btn-primary" disabled={creating}>
            {creating ? 'Creating…' : 'Create Highlight'}
          </button>
        </form>
      )}

      {error && <div className="error-banner">{error}</div>}

      <button className="btn-secondary" onClick={fetchHighlights} disabled={loading}>
        {loading ? 'Loading…' : '↺ Refresh'}
      </button>

      {highlights.length === 0 && !loading && !error && (
        <p className="empty-state">No highlights yet.</p>
      )}

      <div className="highlights-list">
        {highlights.map((h) => (
          <div key={h.id} className="highlight-card">
            <div className="highlight-title">{h.title}</div>
            {h.event && (
              <div className="highlight-event">
                <span className="nick">{h.event.nick}</span>
                <span className="highlight-message">{h.event.message}</span>
                <span className="date">{new Date(h.event.date).toLocaleString()}</span>
              </div>
            )}
            {h.permalink && (
              <a
                href={`https://tools.tornevall.com${h.permalink}`}
                target="_blank"
                rel="noopener noreferrer"
                className="permalink"
              >
                Permalink ↗
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
