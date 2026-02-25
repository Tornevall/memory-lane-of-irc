'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.API_TOKEN || '';

// Serve the static frontend from the public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

/**
 * Middleware: token-based authentication for /api/* routes.
 * The token is read from the Authorization header:
 *   Authorization: Bearer <token>
 * or from the ?token= query parameter.
 */
function requireToken(req, res, next) {
    if (!API_TOKEN) {
        // No token configured – allow all requests (development convenience)
        return next();
    }

    const authHeader = req.headers['authorization'] || '';
    const headerToken = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;
    const queryToken = req.query.token || null;

    if (headerToken === API_TOKEN || queryToken === API_TOKEN) {
        return next();
    }

    res.status(401).json({ error: 'Unauthorized: invalid or missing API token' });
}

// ── Data helpers ─────────────────────────────────────────────────────────────

function loadJSON(filename) {
    const filePath = path.join(__dirname, '..', 'data', filename);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// ── API routes ────────────────────────────────────────────────────────────────

/**
 * GET /api/channels
 * Returns the list of all archived IRC channels.
 */
app.get('/api/channels', requireToken, (req, res) => {
    const channels = loadJSON('channels.json');
    res.json(channels);
});

/**
 * GET /api/channels/:channelId/messages
 * Returns all messages for a specific channel.
 */
app.get('/api/channels/:channelId/messages', requireToken, (req, res) => {
    const channels = loadJSON('channels.json');
    const channel = channels.find((c) => c.id === req.params.channelId);
    if (!channel) {
        return res.status(404).json({ error: 'Channel not found' });
    }

    const messages = loadJSON('messages.json').filter(
        (m) => m.channelId === channel.id
    );
    res.json({ channel, messages });
});

/**
 * GET /api/search?q=<query>
 * Full-text search across all messages (case-insensitive).
 */
app.get('/api/search', requireToken, (req, res) => {
    const query = (req.query.q || '').toLowerCase().trim();
    if (!query) {
        return res.status(400).json({ error: 'Missing search query parameter "q"' });
    }

    const channels = loadJSON('channels.json');
    const channelMap = Object.fromEntries(channels.map((c) => [c.id, c]));
    const results = loadJSON('messages.json').filter((m) =>
        m.text.toLowerCase().includes(query) ||
        m.nick.toLowerCase().includes(query)
    ).map((m) => ({ ...m, channel: channelMap[m.channelId] || null }));

    res.json({ query, count: results.length, results });
});

// ── Start ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
    app.listen(PORT, () => {
        const tokenStatus = API_TOKEN ? 'token authentication enabled' : 'no token configured (open access)';
        console.log(`Memory Lane of IRC API running on http://localhost:${PORT} – ${tokenStatus}`);
    });
}

module.exports = app;
