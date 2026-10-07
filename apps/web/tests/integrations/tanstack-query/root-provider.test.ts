import { environmentManager, onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { getContext } from '#/integrations/tanstack-query/root-provider.tsx';
import { ApiError } from '#/queries/errors.ts';

const queryKey = ['get', '/classrooms'];
const isServer = environmentManager.isServer();

// as regras de retry e rede valem só no navegador
describe('QueryClient do app no navegador', () => {
    beforeEach(() => {
        environmentManager.setIsServer(() => false);
    });

    afterEach(() => {
        environmentManager.setIsServer(() => isServer);
        onlineManager.setOnline(true);
    });

    test('offline falha na hora, sem pausar nem tentar de novo', async () => {
        const { queryClient } = getContext();
        onlineManager.setOnline(false);
        let attempts = 0;

        const error = await queryClient
            .query({
                queryKey,
                queryFn: () => {
                    attempts += 1;
                    return Promise.reject(new TypeError('offline'));
                }
            })
            .catch((reason: unknown) => reason);

        expect(error).toBeInstanceOf(TypeError);
        expect(attempts).toBe(1);
    });

    test('conexão que cai durante o retry não deixa a query pausada', async () => {
        const { queryClient } = getContext();
        let attempts = 0;

        const error = await queryClient
            .query({
                queryKey,
                retryDelay: 10,
                queryFn: () => {
                    attempts += 1;
                    // a primeira falha decide o retry online; a conexão cai durante a espera
                    setTimeout(() => onlineManager.setOnline(false), 0);
                    return Promise.reject(new ApiError(503, 'fora'));
                }
            })
            .catch((reason: unknown) => reason);

        expect(error).toBeInstanceOf(ApiError);
        expect(attempts).toBe(2);
    });
});
