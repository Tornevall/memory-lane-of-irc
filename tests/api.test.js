'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Set a test API token before requiring the server
process.env.API_TOKEN = 'test-secret';
process.env.PORT = '0'; // let the OS pick a free port
const app = require('../api/server');

let server;
let baseUrl;

before(() => new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
    });
}));

after(() => new Promise((resolve) => {
    server.close(resolve);
}));

// ── Helper ────────────────────────────────────────────────────────────────────

async function get(path, token) {
    const url = new URL(path, baseUrl);
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(url.toString(), { headers });
    const json = await res.json();
    return { status: res.status, body: json };
}

// ── Token authentication ──────────────────────────────────────────────────────

describe('Token authentication', () => {
    it('rejects requests with no token', async () => {
        const { status, body } = await get('/api/channels');
        assert.equal(status, 401);
        assert.match(body.error, /Unauthorized/i);
    });

    it('rejects requests with a wrong token', async () => {
        const { status, body } = await get('/api/channels', 'wrong-token');
        assert.equal(status, 401);
        assert.match(body.error, /Unauthorized/i);
    });

    it('allows requests with the correct token', async () => {
        const { status } = await get('/api/channels', 'test-secret');
        assert.equal(status, 200);
    });
});

// ── GET /api/channels ─────────────────────────────────────────────────────────

describe('GET /api/channels', () => {
    it('returns an array of channels', async () => {
        const { status, body } = await get('/api/channels', 'test-secret');
        assert.equal(status, 200);
        assert.ok(Array.isArray(body));
        assert.ok(body.length > 0);
    });

    it('each channel has id, name, network', async () => {
        const { body } = await get('/api/channels', 'test-secret');
        for (const ch of body) {
            assert.ok(ch.id, 'channel has id');
            assert.ok(ch.name, 'channel has name');
            assert.ok(ch.network, 'channel has network');
        }
    });
});

// ── GET /api/channels/:channelId/messages ─────────────────────────────────────

describe('GET /api/channels/:channelId/messages', () => {
    it('returns messages for a valid channel', async () => {
        const { body: channels } = await get('/api/channels', 'test-secret');
        const first = channels[0];
        const { status, body } = await get(
            `/api/channels/${encodeURIComponent(first.id)}/messages`,
            'test-secret'
        );
        assert.equal(status, 200);
        assert.ok(Array.isArray(body.messages));
        assert.equal(body.channel.id, first.id);
    });

    it('returns 404 for an unknown channel', async () => {
        const { status, body } = await get('/api/channels/no-such-channel/messages', 'test-secret');
        assert.equal(status, 404);
        assert.match(body.error, /not found/i);
    });
});

// ── GET /api/search ───────────────────────────────────────────────────────────

describe('GET /api/search', () => {
    it('requires a q parameter', async () => {
        const { status, body } = await get('/api/search', 'test-secret');
        assert.equal(status, 400);
        assert.match(body.error, /missing/i);
    });

    it('returns matching results', async () => {
        const { status, body } = await get('/api/search?q=kernel', 'test-secret');
        assert.equal(status, 200);
        assert.ok(body.count >= 1);
        assert.ok(Array.isArray(body.results));
    });

    it('returns empty results for no match', async () => {
        const { status, body } = await get('/api/search?q=xyzzy_no_match_12345', 'test-secret');
        assert.equal(status, 200);
        assert.equal(body.count, 0);
    });
});
