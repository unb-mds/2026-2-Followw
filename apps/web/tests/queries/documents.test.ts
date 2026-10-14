import type { Middleware } from 'openapi-fetch';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { apiClient } from '#/queries/client';
import { getDocumentDownload } from '#/queries/documents';
import { ApiError } from '#/queries/errors';

describe('download de documentos', () => {
    let middleware: Middleware;
    let requests: Request[];
    let response: () => Response;

    beforeEach(() => {
        requests = [];
        response = () =>
            new Response('%PDF-1.7\nDocumento de teste', {
                headers: { 'content-type': 'application/pdf' }
            });
        middleware = {
            onRequest: ({ request }) => {
                requests.push(request);
                return response();
            }
        };
        apiClient.use(middleware);
    });

    afterEach(() => apiClient.eject(middleware));

    test.each([
        ['student-card', 'carteirinha.pdf'],
        ['transcript', 'historico.pdf']
    ] as const)('baixa %s por POST com sessão e conteúdo binário', async (document, filename) => {
        const file = await getDocumentDownload(document);
        expect(file.filename).toBe(filename);
        expect(file.blob.type).toBe('application/pdf');
        expect(await file.blob.text()).toBe('%PDF-1.7\nDocumento de teste');
        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe('POST');
        expect(requests[0].credentials).toBe('include');
        expect(new URL(requests[0].url).pathname).toBe(`/api/me/${document}`);
        expect(await requests[0].text()).toBe('');
    });

    test.each([401, 502])('propaga o erro HTTP %s sem entregar um arquivo', async (status) => {
        response = () => Response.json({ detail: 'Falha na emissão' }, { status });
        const error = await getDocumentDownload('transcript').catch((cause: unknown) => cause);
        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ status });
        expect(requests).toHaveLength(1);
    });

    test('não aceita um documento vazio', async () => {
        response = () => new Response('', { headers: { 'content-type': 'application/pdf' } });
        const error = await getDocumentDownload('student-card').catch((cause: unknown) => cause);
        expect(error).toMatchObject({ message: 'O documento recebido está vazio.' });
    });

    test('cada download busca o documento novamente', async () => {
        await getDocumentDownload('student-card');
        await getDocumentDownload('student-card');
        expect(requests).toHaveLength(2);
    });
});
