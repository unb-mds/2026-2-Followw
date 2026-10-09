import { describe, expect, test } from 'bun:test';

import { Route as RootRoute } from '#/routes/__root';

import manifest from '../../public/manifest.json';

describe('rota raiz e manifest PWA', () => {
    test('configura tags no head para suporte a PWA e instalação na tela inicial', async () => {
        const head = await RootRoute.options.head?.({});
        expect(head).toBeDefined();

        const links = head?.links ?? [];
        expect(links).toContainEqual({ rel: 'manifest', href: '/manifest.json' });
        expect(links).toContainEqual({ rel: 'icon', href: '/favicon.ico', sizes: '48x48' });
        expect(links).toContainEqual({ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' });
        expect(links).toContainEqual({ rel: 'apple-touch-icon', href: '/apple-touch-icon.png' });

        const meta = head?.meta ?? [];
        expect(meta).toContainEqual({ name: 'theme-color', content: manifest.theme_color });
        expect(meta).toContainEqual({ name: 'apple-mobile-web-app-capable', content: 'yes' });
    });

    test('configura errorComponent na rota raiz', () => {
        expect(RootRoute.options.errorComponent).toBeDefined();
    });

    test('manifest possui campos obrigatórios para instalação como PWA', () => {
        expect(manifest.name).toBe('Followw');
        expect(manifest.short_name).toBe('Followw');
        expect(manifest.start_url).toBe('/');
        expect(manifest.display).toBe('standalone');
        expect(manifest.theme_color).toBe('#007c5d');
        expect(manifest.background_color).toBe('#ffffff');

        // ícone da aplicação instalada
        expect(manifest.icons).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    src: '/app-icon.svg',
                    type: 'image/svg+xml'
                })
            ])
        );
    });
});
