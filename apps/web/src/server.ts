import {
    createServerEntry,
    createStartHandler,
    defaultStreamHandler
} from '@tanstack/react-start/server';

const handle = createStartHandler(defaultStreamHandler);

export default createServerEntry({
    async fetch(request, options) {
        const path = new URL(request.url).pathname;
        if (path !== '/' && path !== '/ru') return handle(request, options);
        const start = performance.now();
        const response = await handle(request, options);
        response.headers.append(
            'Server-Timing',
            `ssr;dur=${(performance.now() - start).toFixed(1)}`
        );
        return response;
    }
});
