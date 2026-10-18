import { afterEach, expect, mock, spyOn, test } from 'bun:test';

import { apiClient } from '#/queries/client';

const timeout = AbortSignal.timeout.bind(AbortSignal);
afterEach(() => mock.restore());

const stalled = (request: Request) =>
    new Promise<Response>((_, reject) => {
        if (request.signal.aborted) reject(request.signal.reason);
        request.signal.addEventListener('abort', () => reject(request.signal.reason), {
            once: true
        });
    });

test('requisição travada expira e permite outra chamada', async () => {
    const timer = spyOn(AbortSignal, 'timeout').mockImplementation(() => timeout(5));
    const error = await apiClient.GET('/me', { fetch: stalled }).then(
        () => null,
        (failure: unknown) => failure
    );
    expect(error).toHaveProperty('name', 'TimeoutError');
    expect(timer).toHaveBeenCalledWith(240_000);
    const result = await apiClient.GET('/me', { fetch: async () => Response.json(null) });
    expect(result.response.status).toBe(200);
});

test('cancelamento do chamador continua interrompendo a rede', async () => {
    const controller = new AbortController();
    controller.abort();
    let aborted = false;
    await apiClient.GET('/me', {
        signal: controller.signal,
        fetch: async (request) => {
            aborted = request.signal.aborted;
            return Response.json(null);
        }
    });
    expect(aborted).toBe(true);
});
