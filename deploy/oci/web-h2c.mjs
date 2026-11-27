import { createServer } from 'node:http2';
import { middleware } from './server/index.mjs';

const SHUTDOWN_TIMEOUT_MS = 5000;

function failRequest(res, error) {
    console.error('[web-h2c] Unhandled request error:', error);
    if (res.writableEnded || res.destroyed) return;
    if (res.headersSent) {
        res.destroy();
        return;
    }
    res.statusCode = 500;
    res.end();
}

function handleRequest(req, res) {
    try {
        const result = middleware(req, res);
        if (typeof result?.then === 'function') {
            result.catch((error) => failRequest(res, error));
        }
    } catch (error) {
        failRequest(res, error);
    }
}

const server = createServer(handleRequest);
const sessions = new Set();

server.on('error', (error) => {
    console.error('[web-h2c] Server error:', error);
});

server.on('sessionError', (error) => {
    console.error('[web-h2c] Session error:', error);
});

server.on('session', (session) => {
    sessions.add(session);
    session.once('close', () => sessions.delete(session));
});

function shutdown() {
    server.close();
    for (const session of sessions) session.close();
    setTimeout(() => {
        for (const session of sessions) session.destroy();
    }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
server.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '0.0.0.0');
