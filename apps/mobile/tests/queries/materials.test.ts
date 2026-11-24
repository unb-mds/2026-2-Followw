import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { shareMaterial } from '@/queries/materials';

import { fakeApi, materialFile } from '../fakes';

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

const POST_ID = 'material:' + 'a'.repeat(64);

describe('material do tópico', () => {
    let server: ReturnType<typeof fakeApi>;

    beforeEach(() => {
        mockWrites.length = 0;
        jest.mocked(File).mockClear();
        jest.mocked(Sharing.shareAsync).mockClear();
        server = fakeApi(() => materialFile());
    });

    afterEach(() => server.eject());

    test('baixa por POST, grava com o nome original e abre o compartilhamento', async () => {
        await shareMaterial('AAA', POST_ID);

        const [request] = server.api.requests;
        expect(request.method).toBe('POST');
        expect(decodeURIComponent(new URL(request.url).pathname)).toBe(
            `/api/classrooms/AAA/posts/${POST_ID}/download`
        );
        expect(mockWrites).toHaveLength(1);
        expect(mockWrites[0].name).toBe('Anotações.txt');
        expect(new TextDecoder().decode(mockWrites[0].bytes)).toBe('arquivo');
        expect(Sharing.shareAsync).toHaveBeenCalledWith(
            'file:///cache/Anotações.txt',
            expect.objectContaining({ mimeType: 'text/plain' })
        );
    });

    test('barra no nome não cria subpasta no cache', async () => {
        server.api.respond = () => materialFile('aula 1/2.pdf');

        await shareMaterial('AAA', POST_ID);

        expect(mockWrites[0].name).toBe('aula 1_2.pdf');
    });

    test('arquivo vazio não é gravado', async () => {
        server.api.respond = () => materialFile('vazio.txt', '');

        await expect(shareMaterial('AAA', POST_ID)).rejects.toThrow('vazio');
        expect(mockWrites).toHaveLength(0);
        expect(Sharing.shareAsync).not.toHaveBeenCalled();
    });
});
