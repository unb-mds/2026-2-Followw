import type { Middleware } from 'openapi-fetch';

import { apiClient } from '@followw/core/queries/client.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';

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
let failBio: boolean;
let bioError: ApiError;
let gate: Promise<void> | null;
let toasts: ReturnType<typeof spyOn>;
beforeEach(async () => {
    const { toast } = await import('#/components/ui/toast');
    client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    });
    client.setQueryData(meQueryOptions.queryKey, user);
    requests = [];
    failName = false;
    failBio = false;
    bioError = new ApiError(502, 'falha');
    gate = null;
    toasts = spyOn(toast, 'add');
    middleware = {
        onRequest: async ({ request }) => {
            requests.push(request.clone());
            await gate;
            if (request.url.endsWith('/settings')) {
                if (failName) throw new ApiError(502, 'falha');
                return Response.json({ displayName: null });
            }
            const bio = (await request.clone().formData()).get('bio');
            if (bio !== null && failBio) throw bioError;
            return Response.json({ ...user, bio: bio ?? user.bio, photo: null });
        }
    };
    apiClient.use(middleware);
});
afterEach(() => {
    toasts.mockRestore();
    dom.testing.cleanup();
    client.clear();
    apiClient.eject(middleware);
});
async function open(profile = user) {
    const { ProfileForm } = await import('#/components/profile/EditProfile');
    const { Dialog } = await import('#/components/ui/dialog');
    const page = dom.testing.render(
        <QueryClientProvider client={client}>
            <Dialog open>
                <ProfileForm
                    user={profile}
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

test('bio antiga longa abre limitada sem ser sobrescrita ao salvar', async () => {
    const page = await open({ ...user, bio: 'a'.repeat(2000) });
    expect(page.container.querySelector('textarea')?.value).toHaveLength(1024);
    dom.testing.fireEvent.click(page.getByRole('button', { name: 'Salvar alterações' }));
    await dom.testing.waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].url).toEndWith('/settings');
});

test('limita a bio a 1024 caracteres e envia só o texto dentro do limite', async () => {
    const page = await open();
    const input = page.container.querySelector('textarea');
    if (!input) throw new Error('Campo de bio não encontrado');
    expect(input.maxLength).toBe(1024);
    const bio = 'a'.repeat(1024);
    dom.testing.fireEvent.change(input, { target: { value: bio + 'fim' } });
    expect(input.value).toBe(bio);
    dom.testing.fireEvent.click(page.getByRole('button', { name: 'Salvar alterações' }));
    await dom.testing.waitFor(() => expect(requests).toHaveLength(2));
    expect((await requests[0].formData()).get('bio')).toBe(bio);
});

test('recusa foto original acima de 4 MB antes do recorte', async () => {
    const page = await open();
    const file = new File(['foto'], 'foto.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'size', { value: 4 * 1024 * 1024 + 1 });
    dom.testing.fireEvent.change(page.getByLabelText('Foto de perfil'), {
        target: { files: [file] }
    });
    expect((await page.findByRole('alert')).textContent).toContain('até 4 MB');
    expect(requests).toHaveLength(0);
});

test('filtra o seletor por jpg, jpeg e png e rejeita outra extensão', async () => {
    const page = await open();
    const picker = page.getByLabelText('Foto de perfil');
    expect(picker.getAttribute('accept')).toBe('.jpg,.jpeg,.png');
    const file = new File(['foto'], 'foto.gif', { type: 'image/jpeg' });
    dom.testing.fireEvent.change(picker, { target: { files: [file] } });
    expect((await page.findByRole('alert')).textContent).toContain('Escolha JPEG ou PNG');
});
test('nome vazio restaura SIGAA sem gravar foto ou bio', async () => {
    const page = await open();
    expect(page.getByText('Este nome só aparecerá no seu Followw.')).toBeDefined();
    expect(page.getByPlaceholderText('Escreva um pouco sobre você').getAttribute('data-slot')).toBe(
        'textarea'
    );
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
    expect(document.querySelector('img')).toBeNull();
    dom.testing.fireEvent.click(page.getByRole('button', { name: 'Cancelar' }));
    expect(requests).toHaveLength(0);
});

test('falha da bio após remoção repete somente a bio', async () => {
    failBio = true;
    const page = await open();
    dom.testing.fireEvent.click(page.getByRole('button', { name: 'Remover foto' }));
    dom.testing.fireEvent.change(page.getByLabelText('Bio'), { target: { value: 'Nova bio' } });
    dom.testing.fireEvent.click(page.getByRole('button', { name: 'Salvar alterações' }));
    await page.findByText('Foto removida. Não foi possível confirmar a alteração da bio no SIGAA.');
    const removal = await requests[0].formData();
    expect(removal.get('photo_action')).toBe('remove');
    expect(removal.has('bio')).toBe(false);
    expect((await requests[1].formData()).get('photo_action')).toBe('keep');
    failBio = false;
    dom.testing.fireEvent.click(page.getByRole('button', { name: 'Salvar alterações' }));
    await dom.testing.waitFor(() => expect(requests).toHaveLength(4));
    const retry = await requests[2].formData();
    expect(retry.get('photo_action')).toBe('keep');
    expect(retry.get('bio')).toBe('Nova bio');
});
test('falha do nome após sucesso remoto repete somente o nome', async () => {
    failName = true;
    const page = await open();
    dom.testing.fireEvent.change(page.getByLabelText('Bio'), { target: { value: 'Nova bio' } });
    dom.testing.fireEvent.click(page.getByRole('button', { name: 'Salvar alterações' }));
    await page.findByText(
        'Alterações salvas no SIGAA. Não foi possível salvar o nome. Tente novamente.'
    );
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

test('limite de tentativas após remover a foto explica o motivo', async () => {
    failBio = true;
    bioError = new ApiError(429, 'Too many requests');
    const page = await open();
    dom.testing.fireEvent.click(page.getByRole('button', { name: 'Remover foto' }));
    dom.testing.fireEvent.change(page.getByLabelText('Bio'), { target: { value: 'Nova bio' } });
    dom.testing.fireEvent.click(page.getByRole('button', { name: 'Salvar alterações' }));
    await page.findByText('Foto removida. Muitas tentativas. Aguarde um pouco e tente novamente.');
});
test('validação recusada pela api mostra a mensagem do servidor', async () => {
    failBio = true;
    bioError = new ApiError(422, 'A bio deve ter até 1024 caracteres.');
    const page = await open();
    dom.testing.fireEvent.change(page.getByLabelText('Bio'), { target: { value: 'Nova bio' } });
    dom.testing.fireEvent.click(page.getByRole('button', { name: 'Salvar alterações' }));
    await page.findByText('A bio deve ter até 1024 caracteres.');
});
test('foto que não carrega mostra o avatar e não o texto alternativo', async () => {
    await open();
    const image = document.querySelector('img');
    if (!image) throw new Error('Foto não encontrada');
    expect(image.getAttribute('alt')).toBe('');
    dom.testing.fireEvent.error(image);
    expect(document.querySelector('img')).toBeNull();
});
test('avisa por toast quando salva com sucesso', async () => {
    const page = await open();
    dom.testing.fireEvent.change(page.getByLabelText('Bio'), { target: { value: 'Nova bio' } });
    dom.testing.fireEvent.click(page.getByRole('button', { name: 'Salvar alterações' }));
    await dom.testing.waitFor(() => expect(toasts).toHaveBeenCalledTimes(1));
    expect(toasts.mock.calls[0][0]).toMatchObject({
        type: 'success',
        title: 'Perfil atualizado'
    });
});
test('avisa por toast quando o salvamento falha', async () => {
    failBio = true;
    const page = await open();
    dom.testing.fireEvent.change(page.getByLabelText('Bio'), { target: { value: 'Nova bio' } });
    dom.testing.fireEvent.click(page.getByRole('button', { name: 'Salvar alterações' }));
    await dom.testing.waitFor(() => expect(toasts).toHaveBeenCalledTimes(1));
    expect(toasts.mock.calls[0][0]).toMatchObject({
        type: 'error',
        description:
            'Não foi possível confirmar a alteração no SIGAA. Confira o perfil antes de tentar novamente.'
    });
});
test('salvamento em andamento mantém Cancelar desativado e conclui com toast', async () => {
    const release = Promise.withResolvers<void>();
    gate = release.promise;
    const close = mock(() => {});
    const saving = mock((_value: boolean) => {});
    const { ProfileForm } = await import('#/components/profile/EditProfile');
    const { Dialog } = await import('#/components/ui/dialog');
    const page = dom.testing.render(
        <QueryClientProvider client={client}>
            <Dialog open>
                <ProfileForm user={user} displayName="Ana" close={close} onSavingChange={saving} />
            </Dialog>
        </QueryClientProvider>
    );
    dom.testing.fireEvent.change(await page.findByLabelText('Bio'), {
        target: { value: 'Nova bio' }
    });
    dom.testing.fireEvent.click(page.getByRole('button', { name: 'Salvar alterações' }));
    await dom.testing.waitFor(() =>
        expect(page.getByRole('button', { name: 'Cancelar' }).hasAttribute('disabled')).toBe(true)
    );
    expect(saving).toHaveBeenLastCalledWith(true);
    expect(toasts).not.toHaveBeenCalled();
    release.resolve();
    await dom.testing.waitFor(() => expect(toasts).toHaveBeenCalledTimes(1));
    expect(toasts.mock.calls[0][0]).toMatchObject({ type: 'success' });
    expect(close).toHaveBeenCalledTimes(1);
    expect(saving).toHaveBeenLastCalledWith(false);
});
