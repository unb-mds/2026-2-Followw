import { describe, expect, test } from 'bun:test';

import { shareFile } from '#/lib/share-file';

describe('shareFile', () => {
    test('compartilha apenas o arquivo, sem URL ou texto', async () => {
        const file = new File(['%PDF-1.7'], 'carteirinha.pdf', { type: 'application/pdf' });
        let checked: ShareData | undefined;
        let shared: ShareData | undefined;
        const api: Pick<Navigator, 'canShare' | 'share'> = {
            canShare(data) {
                checked = data;
                return true;
            },
            async share(data) {
                shared = data;
            }
        };

        expect(await shareFile(file, api)).toBe(true);
        expect(checked).toEqual({ files: [file] });
        expect(shared).toEqual({ files: [file] });
    });

    test('informa quando o navegador não aceita compartilhar arquivos', async () => {
        const file = new File(['%PDF-1.7'], 'carteirinha.pdf', { type: 'application/pdf' });
        let shared = false;
        const api: Pick<Navigator, 'canShare' | 'share'> = {
            canShare: () => false,
            async share() {
                shared = true;
            }
        };

        expect(await shareFile(file, api)).toBe(false);
        expect(shared).toBe(false);
    });
});
