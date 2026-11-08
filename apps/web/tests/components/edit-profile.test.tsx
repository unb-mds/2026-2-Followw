import type { Middleware } from 'openapi-fetch';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { apiClient } from '#/queries/client';
import { ApiError } from '#/queries/errors';
import { meQueryOptions, type UserProfile } from '#/queries/me';

import { useDom } from '../helpers/dom';

const dom = useDom();
const user: UserProfile = {
    name: 'Nome SIGAA',
    registration: '123',
    photo: 'https://arquivos.unb.br/foto.jpg',
    bio: 'Bio anterior',
    course: null,
    unit: null,
    entry_semester: null,
    integralization: null,
    workload: null,
    period_max_workload: null,
    ira: null,
    mp: null,
    level: 'Graduação'
};
let client: QueryClient;
let middleware: Middleware;
let requests: Request[];
let failName: boolean;
beforeEach(() => {
    client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    });
    client.setQueryData(meQueryOptions.queryKey, user);
    requests = [];
    failName = false;
    middleware = {
        onRequest: ({ request }) => {
            requests.push(request.clone());
            if (request.url.endsWith('/settings')) {
                if (failName) throw new ApiError(502, 'falha');
                return Response.json({ displayName: null });
            }
            return Response.json({ ...user, bio: 'Nova bio', photo: null });
        }
    };
    apiClient.use(middleware);
});
afterEach(() => {
    dom.testing.cleanup();
    client.clear();
    apiClient.eject(middleware);
});
async function open() {
    const { ProfileForm } = await import('#/components/profile/EditProfile');
    const { Dialog } = await import('#/components/ui/dialog');
    const page = dom.testing.render(
        <QueryClientProvider client={client}>
            <Dialog open>
                <ProfileForm
                    user={user}
                    displayName="Ana"
                    close={() => {}}
                    onSavingChange={() => {}}
                />
            </Dialog>
        </QueryClientProvider>
    );
    await page.findByLabelText('Nome de exibição');
    return page;
}
test('nome vazio restaura SIGAA sem gravar foto ou bio', async () => {
    const page = await open();
    expect(page.queryByText('Visível apenas no Followw')).toBeNull();
    expect(page.queryByRole('slider')).toBeNull();
    dom.testing.fireEvent.change(page.getByLabelText('Nome de exibição'), {
        target: { value: '  ' }
    });
    dom.testing.fireEvent.click(page.getByRole('button', { name: 'Salvar alterações' }));
    await dom.testing.waitFor(() => expect(requests).toHaveLength(1));
    expect(await requests[0].json()).toEqual({ displayName: null });
});
test('remover foto só envia ao salvar e cancelar não grava', async () => {
    const page = await open();
    dom.testing.fireEvent.click(page.getByRole('button', { name: 'Remover foto' }));
    expect(requests).toHaveLength(0);
    expect(page.queryByRole('img')).toBeNull();
    dom.testing.fireEvent.click(page.getByRole('button', { name: 'Cancelar' }));
    expect(requests).toHaveLength(0);
});
test('falha do nome após sucesso remoto repete somente o nome', async () => {
    failName = true;
    const page = await open();
    dom.testing.fireEvent.change(page.getByLabelText('Bio'), { target: { value: 'Nova bio' } });
    dom.testing.fireEvent.click(page.getByRole('button', { name: 'Salvar alterações' }));
    await page.findByText('Foto e bio salvas. Não foi possível salvar o nome. Tente novamente.');
    expect(requests).toHaveLength(2);
    const form = await requests[0].formData();
    expect(form.get('bio')).toBe('Nova bio');
    expect(form.get('photo_action')).toBe('keep');
    failName = false;
    dom.testing.fireEvent.click(page.getByRole('button', { name: 'Salvar alterações' }));
    await dom.testing.waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2].url).toEndWith('/settings');
});

test('ajuste produz recorte 4 por 5 somente após confirmação', async () => {
    const { PhotoCrop } = await import('#/components/profile/PhotoCrop');
    const bitmap = { width: 1600, height: 1200, close: () => {} };
    const previousBitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
    Object.defineProperty(globalThis, 'createImageBitmap', {
        configurable: true,
        value: async () => bitmap
    });
    const prototype = Object.getPrototypeOf(document.createElement('canvas'));
    const previousContext = prototype.getContext;
    const previousBlob = prototype.toBlob;
    const draws: unknown[][] = [];
    prototype.getContext = () => ({
        fillRect: () => {},
        drawImage: (...args: unknown[]) => draws.push(args)
    });
    prototype.toBlob = (callback: (blob: Blob) => void) =>
        callback(new Blob(['jpeg'], { type: 'image/jpeg' }));
    const confirmed: File[] = [];
    try {
        const page = dom.testing.render(
            <PhotoCrop
                file={new File(['foto'], 'foto.jpg', { type: 'image/jpeg' })}
                onConfirm={(file) => confirmed.push(file)}
                onCancel={() => {}}
            />
        );
        await dom.testing.waitFor(() => expect(draws.length).toBeGreaterThan(0));
        expect(confirmed).toHaveLength(0);
        expect(page.queryByRole('slider')).toBeNull();
        const viewport = page.getByLabelText('Ajustar enquadramento da foto');
        viewport.setPointerCapture = () => {};
        viewport.getBoundingClientRect = () => ({
            width: 256,
            height: 320,
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 256,
            bottom: 320,
            toJSON: () => ({})
        });
        const pointer = (type: string, id: number, x: number, y: number) =>
            dom.testing.fireEvent(
                viewport,
                new window.PointerEvent(type, {
                    bubbles: true,
                    pointerId: id,
                    clientX: x,
                    clientY: y
                })
            );
        const initialWidth = Number(draws.at(-1)![3]);
        dom.testing.fireEvent.wheel(viewport, { deltaY: -350 });
        await dom.testing.waitFor(() =>
            expect(Number(draws.at(-1)![3])).toBeLessThan(initialWidth)
        );
        const beforePan = Number(draws.at(-1)![1]);
        dom.testing.fireEvent.keyDown(viewport, { key: 'ArrowLeft' });
        expect(Number(draws.at(-1)![1])).toBeGreaterThan(beforePan);
        const beforeDrag = Number(draws.at(-1)![1]);
        pointer('pointerdown', 1, 100, 100);
        pointer('pointermove', 1, 120, 100);
        expect(Number(draws.at(-1)![1])).toBeLessThan(beforeDrag);
        pointer('pointerdown', 2, 180, 100);
        const beforePinch = Number(draws.at(-1)![3]);
        pointer('pointermove', 2, 240, 100);
        expect(Number(draws.at(-1)![3])).toBeLessThan(beforePinch);
        pointer('pointerup', 2, 240, 100);
        pointer('pointermove', 1, 10000, 10000);
        expect(Number(draws.at(-1)![1])).toBeGreaterThanOrEqual(0);
        expect(Number(draws.at(-1)![2])).toBeGreaterThanOrEqual(0);
        pointer('pointercancel', 1, 10000, 10000);
        const last = draws.at(-1)!;
        expect(Number(last[3]) / Number(last[4])).toBeCloseTo(0.8);
        expect(last.slice(-2)).toEqual([800, 1000]);
        dom.testing.fireEvent.click(page.getByRole('button', { name: 'Confirmar foto' }));
        expect(confirmed[0].type).toBe('image/jpeg');
    } finally {
        dom.testing.cleanup();
        prototype.getContext = previousContext;
        prototype.toBlob = previousBlob;
        if (previousBitmap) Object.defineProperty(globalThis, 'createImageBitmap', previousBitmap);
        else Reflect.deleteProperty(globalThis, 'createImageBitmap');
    }
});
