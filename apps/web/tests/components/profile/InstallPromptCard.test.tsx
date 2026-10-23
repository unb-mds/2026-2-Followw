import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { useLayoutEffect } from 'react';

import { initializeInstallSupport } from '#/integrations/offline/install';

import { useDom } from '../../helpers/dom';

const dom = useDom();
let InstallPromptCard: typeof import('#/components/profile/InstallPromptCard').InstallPromptCard;
let restoreLayoutEffect: () => Promise<void>;
beforeAll(async () => {
    // Outros testes importam Base UI durante SSR; restaura o hook de navegador neste DOM.
    const { useIsoLayoutEffect } = await import('@base-ui/utils/useIsoLayoutEffect');
    await mock.module('@base-ui/utils/useIsoLayoutEffect', () => ({
        useIsoLayoutEffect: useLayoutEffect
    }));
    restoreLayoutEffect = async () => {
        await mock.module('@base-ui/utils/useIsoLayoutEffect', () => ({ useIsoLayoutEffect }));
    };
    ({ InstallPromptCard } = await import('#/components/profile/InstallPromptCard'));
});
afterAll(() => restoreLayoutEffect());
const safari = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1';
let dispose: () => void;

function initialize(userAgent = safari, previewIos = false) {
    Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: userAgent });
    dispose = initializeInstallSupport();
    return dom.testing.render(<InstallPromptCard previewIos={previewIos} />);
}

beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
    dom.testing.cleanup();
    dispose?.();
});

describe('card de instalação', () => {
    test.each(['light', 'dark'])(
        'percorre as três instruções e o resumo no tema %s',
        async (theme) => {
            document.documentElement.setAttribute('data-theme', theme);
            const page = initialize();
            expect(page.getByRole('img', { name: /ao lado dos seus aplicativos/ })).toBeTruthy();
            const trigger = page.getByRole('button', { name: 'Instalar app' });
            dom.testing.fireEvent.click(trigger, { button: 0 });
            expect(await page.findByRole('dialog', { name: 'Instale o Followw' })).toBeTruthy();
            expect(page.getByRole('heading', { name: '1. Abra o menu' })).toBeTruthy();
            expect(page.getByRole('img', { name: /botão de menu destacado/ })).toBeTruthy();
            expect(
                page.getByRole('button', { name: 'Instrução anterior' }).hasAttribute('disabled')
            ).toBe(true);
            expect(page.queryByRole('button', { name: 'Entendi' })).toBeNull();

            dom.testing.fireEvent.click(page.getByRole('button', { name: 'Próxima instrução' }));
            expect(page.getByRole('heading', { name: '2. Selecione Compartilhar' })).toBeTruthy();
            expect(page.getByRole('img', { name: /opção Compartilhar destacada/ })).toBeTruthy();
            dom.testing.fireEvent.click(page.getByRole('button', { name: 'Instrução anterior' }));
            expect(page.getByRole('heading', { name: '1. Abra o menu' })).toBeTruthy();
            dom.testing.fireEvent.click(page.getByRole('button', { name: 'Próxima instrução' }));
            dom.testing.fireEvent.click(page.getByRole('button', { name: 'Próxima instrução' }));
            expect(
                page.getByRole('heading', { name: '3. Adicione à Tela de Início' })
            ).toBeTruthy();
            expect(
                page.getByRole('img', { name: /Adicionar à Tela de Início destacado/ })
            ).toBeTruthy();
            dom.testing.fireEvent.click(
                page.getByRole('button', { name: 'Ver instruções completas' })
            );
            expect(page.getAllByRole('listitem')).toHaveLength(3);
            expect(page.getByText('“Abrir como App da Web”')).toBeTruthy();
            expect(page.getByText('“Adicionar”')).toBeTruthy();
            dom.testing.fireEvent.click(page.getByRole('button', { name: 'Instrução anterior' }));
            expect(
                page.getByRole('heading', { name: '3. Adicione à Tela de Início' })
            ).toBeTruthy();
            dom.testing.fireEvent.click(
                page.getByRole('button', { name: 'Ver instruções completas' })
            );
            dom.testing.fireEvent.click(page.getByRole('button', { name: 'Entendi' }));
            await page.findByRole('button', { name: 'Instalar app' });
            await page.findByRole('button', { name: 'Instalar app' });
            dom.testing.fireEvent.click(trigger, { button: 0 });
            expect(await page.findByRole('heading', { name: '1. Abra o menu' })).toBeTruthy();
        }
    );

    test('permite fechar e reinicia o tour ao abrir novamente', async () => {
        const page = initialize();
        dom.testing.fireEvent.click(page.getByRole('button', { name: 'Instalar app' }), {
            button: 0
        });
        await page.findByRole('dialog');
        dom.testing.fireEvent.click(page.getByRole('button', { name: 'Próxima instrução' }));
        dom.testing.fireEvent.click(
            page.getByRole('button', { name: 'Fechar instruções de instalação' })
        );
        await page.findByRole('button', { name: 'Instalar app' });
        dom.testing.fireEvent.click(page.getByRole('button', { name: 'Instalar app' }), {
            button: 0
        });
        expect(await page.findByRole('heading', { name: '1. Abra o menu' })).toBeTruthy();
    });

    test.each(['light', 'dark'])(
        'mantém o card antigo e o instalador nativo no Android no tema %s',
        async (theme) => {
            document.documentElement.setAttribute('data-theme', theme);
            const page = initialize(
                'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
            );
            const prompt = mock(async () => {});
            const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
                prompt,
                userChoice: Promise.resolve({ outcome: 'dismissed' })
            });
            dom.testing.act(() => {
                window.dispatchEvent(event);
            });
            expect(page.queryByRole('img', { name: /ao lado dos seus aplicativos/ })).toBeNull();
            expect(
                page.getByText(
                    /Acesse o app com um toque e consulte suas turmas já acessadas mesmo sem internet/
                )
            ).toBeTruthy();
            expect(page.queryByText('Suas turmas a um toque, direto da tela inicial.')).toBeNull();
            expect(
                page.getByRole('button', { name: 'Instalar app' }).getAttribute('aria-haspopup')
            ).toBeNull();
            await dom.testing.act(async () => {
                dom.testing.fireEvent.click(page.getByRole('button', { name: 'Instalar app' }), {
                    button: 0
                });
            });
            expect(prompt).toHaveBeenCalledTimes(1);
            expect(page.queryByRole('dialog')).toBeNull();
        }
    );

    test('não exibe o card em navegador sem instalação disponível', () => {
        const page = initialize('Mozilla/5.0 (X11; Linux x86_64)');
        expect(page.queryByRole('button', { name: 'Instalar app' })).toBeNull();
    });

    test('permite visualizar o tour no desktop sem alterar a preferência de instalação', async () => {
        const page = initialize('Mozilla/5.0 (X11; Linux x86_64)', true);
        expect(page.getByRole('img', { name: /ao lado dos seus aplicativos/ })).toBeTruthy();
        dom.testing.fireEvent.click(page.getByRole('button', { name: 'Instalar app' }), {
            button: 0
        });
        expect(await page.findByRole('heading', { name: '1. Abra o menu' })).toBeTruthy();
        dom.testing.fireEvent.click(
            page.getByRole('button', { name: 'Fechar instruções de instalação' })
        );
        await page.findByRole('button', { name: 'Instalar app' });
        dom.testing.fireEvent.click(
            page.getByRole('button', { name: 'Ocultar sugestão de instalação' })
        );
        expect(page.queryByRole('button', { name: 'Instalar app' })).toBeNull();
        expect(window.localStorage.getItem('followw:install-dismissed')).toBeNull();
    });

    test('permite ocultar a sugestão de instalação no iOS', () => {
        const page = initialize();
        dom.testing.fireEvent.click(
            page.getByRole('button', { name: 'Ocultar sugestão de instalação' })
        );
        expect(page.queryByRole('button', { name: 'Instalar app' })).toBeNull();
        expect(window.localStorage.getItem('followw:install-dismissed')).toBe('1');
    });
});
