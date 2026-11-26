import { createServer } from 'node:http2';
import { middleware } from './server/index.mjs';

const server = createServer(middleware);
const sessions = new Set();

server.on('session', (session) => {
    sessions.add(session);
    session.once('close', () => sessions.delete(session));
});

function shutdown() {
    server.close();
    for (const session of sessions) session.close();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
server.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '0.0.0.0');
