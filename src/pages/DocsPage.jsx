import { getApiBaseUrl } from '../services/api';

export default function DocsPage() {
  const apiBaseUrl = getApiBaseUrl();
  const toolsDocsUrl = `${apiBaseUrl}/docs`;

  return (
    <div className="page docs-page">
      <h1>API Documentation</h1>
      <p className="docs-intro">
        Base URL: <code>{apiBaseUrl}</code>
      </p>
      <div className="docs-link-row">
        <span className="docs-intro docs-links-label">Documentation:</span>
        <a className="docs-link-chip" href="https://loggarna.tornevall.net/docs" target="_blank" rel="noreferrer">
          loggarna.tornevall.net/docs
        </a>
        <a className="docs-link-chip" href={toolsDocsUrl} target="_blank" rel="noreferrer">
          tools docs
        </a>
      </div>

      <section className="docs-section">
        <h2>Authentication</h2>
        <p>
          API key is optional for read endpoints (readonly mode). Write endpoints require a Bearer token:
        </p>
        <p>
          On trusted hosts (<code>tools.tornevall.com</code> and <code>tools.tornevall.net</code>), the frontend
          auto-detects relaxed mode where API key is optional.
        </p>
        <pre><code>{`Authorization: Bearer YOUR_API_KEY`}</code></pre>
      </section>

      <section className="docs-section">
        <h2>Rate Limits</h2>
        <ul>
          <li>Max 1000 results per request</li>
          <li>100 requests per minute</li>
          <li>30 second timeout</li>
        </ul>
      </section>

      <section className="docs-section">
        <h2>Simple Search</h2>
        <p><span className="method get">GET</span> <code>/irc/api/logs</code></p>
        <h3>Query Parameters</h3>
        <table className="params-table">
          <thead>
            <tr><th>Parameter</th><th>Type</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td>q</td><td>string</td><td>Search query (required)</td></tr>
            <tr><td>channel_id</td><td>integer</td><td>Filter by channel ID (optional)</td></tr>
          </tbody>
        </table>
        <h3>Example Request</h3>
        <pre><code>{`curl \\
  "${apiBaseUrl}/irc/api/logs?q=hello&channel_id=123&source=production"`}</code></pre>
      </section>

      <section className="docs-section">
        <h2>Advanced Search</h2>
        <p><span className="method get">GET</span> <code>/irc/api/logs</code></p>
        <h3>Supported Parameters</h3>
        <pre><code>{`{
  "query": "php mysql",
  "channel_id": 123,
  "nick": "Robin",
  "date_from": "2024-01-01",
  "date_to": "2024-12-31",
  "limit": 50,
  "page": 1
}`}</code></pre>
        <h3>Example Request</h3>
        <pre><code>{`curl \\
  "${apiBaseUrl}/irc/api/logs?q=php+mysql&nick=Robin&limit=10&page=1&source=production"`}</code></pre>
        <h3>Response</h3>
        <pre><code>{`{
  "results": [
    {
      "id": 12345,
      "channel": "#general",
      "network": "EFNet",
      "nick": "Robin",
      "message": "php and mysql",
      "occurred_at": "2024-01-15T14:30:00Z",
      "permalink": "/irclog/h/abc123xyz"
    }
  ],
  "total": 42,
  "page": 1,
  "per_page": 50
}`}</code></pre>
      </section>

      <section className="docs-section">
        <h2>Get Highlights</h2>
        <p><span className="method get">GET</span> <code>/api/irclog/highlights</code></p>
        <h3>Example Request</h3>
        <pre><code>{`curl \\
  "${apiBaseUrl}/api/irclog/highlights"`}</code></pre>
        <h3>Response</h3>
        <pre><code>{`{
  "highlights": [
    {
      "id": 789,
      "title": "Funny quote",
      "event": {
        "nick": "Robin",
        "message": "That was funny!",
        "date": "2024-01-15T14:30:00Z"
      },
      "permalink": "/irclog/h/abc123xyz"
    }
  ]
}`}</code></pre>
      </section>

      <section className="docs-section">
        <h2>Create Highlight</h2>
        <p><span className="method post">POST</span> <code>/api/irclog/highlights</code></p>
        <h3>Request Body</h3>
        <pre><code>{`{
  "log_event_id": 12345,
  "title": "Important quote",
  "note": "This person was right",
  "is_public": true
}`}</code></pre>
        <h3>Example Request</h3>
        <pre><code>{`curl -X POST \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"log_event_id":12345,"title":"Great quote","is_public":true}' \\
  "${apiBaseUrl}/api/irclog/highlights"`}</code></pre>
        <h3>Response</h3>
        <pre><code>{`{
  "id": 789,
  "permalink": "/irclog/h/abc123xyz"
}`}</code></pre>
      </section>

      <section className="docs-section">
        <h2>Error Responses</h2>
        <pre><code>{`{
  "error": "Something went wrong",
  "code": "ERROR_CODE"
}`}</code></pre>
        <table className="params-table">
          <thead>
            <tr><th>Code</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td>AUTH_REQUIRED</td><td>Missing or invalid API key</td></tr>
            <tr><td>NOT_FOUND</td><td>Resource not found</td></tr>
            <tr><td>RATE_LIMIT</td><td>Too many requests (100/min)</td></tr>
            <tr><td>VALIDATION_ERROR</td><td>Invalid request parameters</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
