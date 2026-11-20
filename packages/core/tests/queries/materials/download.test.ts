import type { Middleware } from 'openapi-fetch';

import { afterEach, beforeEach, expect, test } from 'bun:test';

import { apiClient } from '../../../src/queries/client.ts';
import { getMaterialDownload } from '../../../src/queries/materials.ts';

let middleware: Middleware;
let requests: Request[];
let response: () => Response;

beforeEach(() => {
    requests = [];
    response = () =>
        new Response('arquivo', {
            headers: {
                'content-type': 'text/plain; charset=utf-8',
                'content-disposition': "attachment; filename*=UTF-8''Anota%C3%A7%C3%B5es.txt"
            }
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

test('baixa por turma e id preservando nome original tipo e bytes', async () => {
    const id = 'material:' + 'a'.repeat(64);
    const file = await getMaterialDownload('AAA', id);
    expect(file.filename).toBe('Anotações.txt');
    expect(file.blob.type).toBe('text/plain;charset=utf-8');
    expect(await file.blob.text()).toBe('arquivo');
    expect(requests[0].method).toBe('POST');
    expect(requests[0].credentials).toBe('include');
    expect(decodeURIComponent(new URL(requests[0].url).pathname)).toBe(
        `/api/classrooms/AAA/posts/${id}/download`
    );
});

test('cada clique faz nova requisição sem cache de arquivo', async () => {
    await getMaterialDownload('AAA', 'material:' + 'a'.repeat(64));
    await getMaterialDownload('AAA', 'material:' + 'a'.repeat(64));
    expect(requests).toHaveLength(2);
});

test('nome com codificação malformada é mantido como veio', async () => {
    response = () =>
        new Response('arquivo', {
            headers: { 'content-disposition': "attachment; filename*=UTF-8''100%.txt" }
        });
    const file = await getMaterialDownload('AAA', 'material:' + 'a'.repeat(64));
    expect(file.filename).toBe('100%.txt');
});

test('rejeita corpo vazio ou nome ausente', async () => {
    response = () => new Response('');
    expect(
        await getMaterialDownload('AAA', 'material:' + 'a'.repeat(64)).catch(
            (error: unknown) => error
        )
    ).toMatchObject({ message: 'O arquivo recebido está vazio.' });
    response = () => new Response('arquivo');
    expect(
        await getMaterialDownload('AAA', 'material:' + 'a'.repeat(64)).catch(
            (error: unknown) => error
        )
    ).toMatchObject({ message: 'O arquivo recebido não informa seu nome.' });
});

test('falha do SIGAA não vira arquivo para salvar', async () => {
    response = () => Response.json({ detail: 'SIGAA is unavailable' }, { status: 502 });
    expect(
        await getMaterialDownload('AAA', 'material:' + 'a'.repeat(64)).catch(
            (error: unknown) => error
        )
    ).toBeInstanceOf(Error);
});
