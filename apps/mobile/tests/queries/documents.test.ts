import type { Middleware } from 'openapi-fetch';

import { apiClient, setApiOrigin } from '@followw/core/queries/client.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import {
    DOWNLOAD_FAILURE_MESSAGE,
    documentFailureMessage,
    downloadDocument,
    shareDocument
} from '@/queries/documents';

const mockWrites: { name: string; bytes: Uint8Array }[] = [];

jest.mock('expo-file-system', () => ({
    Paths: { cache: 'file:///cache/' },
    File: jest.fn().mockImplementation((dir: string, name: string) => ({
        uri: `${dir}${name}`,
        create: jest.fn(),
        write: async (bytes: Uint8Array) => void mockWrites.push({ name, bytes })
    }))
}));

jest.mock('expo-sharing', () => ({
    isAvailableAsync: jest.fn(async () => true),
    shareAsync: jest.fn(async () => {})
}));

describe('documentos do aluno', () => {
    let middleware: Middleware;
    let requests: Request[];
    let response: () => Response;

    beforeEach(() => {
        setApiOrigin('http://localhost');
        mockWrites.length = 0;
        jest.mocked(File).mockClear();
        requests = [];
        response = () =>
            new Response('%PDF-1.7 teste', { headers: { 'content-type': 'application/pdf' } });
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
    ] as const)('baixa %s por POST e grava %s no cache', async (document, filename) => {
        const uri = await downloadDocument(document);

        expect(uri).toBe(`file:///cache/${filename}`);
        expect(requests[0].method).toBe('POST');
        expect(new URL(requests[0].url).pathname).toBe(`/api/me/${document}`);
        expect(mockWrites).toHaveLength(1);
        expect(new TextDecoder().decode(mockWrites[0].bytes)).toBe('%PDF-1.7 teste');
    });

    test('não aceita um documento vazio', async () => {
        response = () => new Response('', { headers: { 'content-type': 'application/pdf' } });

        await expect(downloadDocument('transcript')).rejects.toThrow(
            'O documento recebido está vazio.'
        );
        expect(mockWrites).toHaveLength(0);
    });

    test('abre o PDF na folha de compartilhamento', async () => {
        await shareDocument('student-card');

        expect(Sharing.shareAsync).toHaveBeenCalledWith(
            'file:///cache/carteirinha.pdf',
            expect.objectContaining({ mimeType: 'application/pdf' })
        );
    });

    test('falha se o compartilhamento não está disponível', async () => {
        jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);

        await expect(shareDocument('student-card')).rejects.toThrow('indisponível');
    });
});

describe('documentFailureMessage', () => {
    test('repassa a recusa do SIGAA (422 com texto)', () => {
        const detail = 'Você não possui foto de perfil.';
        expect(documentFailureMessage(new ApiError(422, detail))).toBe(detail);
    });

    test.each([new ApiError(502, 'SIGAA is unavailable'), new Error('rede')])(
        'outras falhas usam a mensagem genérica: %p',
        (error) => {
            expect(documentFailureMessage(error)).toBe(DOWNLOAD_FAILURE_MESSAGE);
        }
    );
});
