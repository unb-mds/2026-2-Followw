import { describe, expect, test } from 'bun:test';

import { prepareOrShareFile, shareFile } from '#/lib/share-file';

async function unexpectedDownload(): Promise<File> {
    throw new Error('Não deve baixar novamente');
}

test('download lento prepara; novo clique compartilha imediatamente sem repetir download', async () => {
    const file = new File(['%PDF-1.7'], 'historico.pdf', { type: 'application/pdf' });
    const download = Promise.withResolvers<File>();
    let downloads = 0;
    let activation = true;
    const shared: (ShareData | undefined)[] = [];
    const api: Pick<Navigator, 'canShare' | 'share'> = {
        canShare: () => true,
        async share(data) {
            if (!activation) throw new DOMException('Clique expirado', 'NotAllowedError');
            shared.push(data);
        }
    };
    const prepare = () => {
        downloads++;
        return download.promise;
    };
    const firstClick = prepareOrShareFile(undefined, prepare, api);
    activation = false;
    download.resolve(file);
    const ready = await firstClick;
    expect(ready).toEqual({ file, status: 'ready' });
    expect(shared).toHaveLength(0);
    activation = true;
    const secondClick = prepareOrShareFile(ready.file, prepare, api);
    expect(shared).toEqual([{ files: [file] }]);
    activation = false;
    expect(await secondClick).toEqual({ file, status: 'shared' });
    expect(downloads).toBe(1);
});

test('arquivo preparado permanece disponível após cancelamento ou falta de suporte', async () => {
    const file = new File(['%PDF-1.7'], 'historico.pdf', { type: 'application/pdf' });
    const cancelled = await prepareOrShareFile(file, unexpectedDownload, {
        canShare: () => true,
        async share() {
            throw new DOMException('Cancelado', 'AbortError');
        }
    });
    expect(cancelled.file).toBe(file);
    const unsupported = await prepareOrShareFile(file, unexpectedDownload, {
        canShare: () => false,
        async share() {
            throw new Error('Não deve compartilhar');
        }
    });
    expect(unsupported).toEqual({ file, status: 'unsupported' });
});

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
