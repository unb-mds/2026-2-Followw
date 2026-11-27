import { expect, test } from 'bun:test';

import { createDeletionFixture, ACCOUNT } from './helpers';

const fixture = createDeletionFixture();

test('explica o que apaga, o que mantém e que as sessões continuam ativas', async () => {
    const page = await fixture.render();
    expect(await page.findByRole('heading', { name: 'Confirmar exclusão' })).toBeTruthy();
    expect(page.getByRole('heading', { name: 'O que será apagado' })).toBeTruthy();
    expect(page.getByRole('heading', { name: 'O que será mantido' })).toBeTruthy();
    expect(page.getByText(/Nome, matrícula, foto, e-mail, curso/)).toBeTruthy();
    expect(page.getByText(/Suas sessões continuam ativas/)).toBeTruthy();
    expect(page.getByText(/Nada muda no SIGAA/)).toBeTruthy();
    expect(page.queryByText('Aplicativos')).toBeNull();
    expect(page.queryByText(/aplicativos conectados perderão/)).toBeNull();
    expect(page.queryByText(/deixarão de funcionar/)).toBeNull();
    expect(
        fixture.requests.every((request) => new URL(request.url).pathname === '/api/me/data')
    ).toBe(true);
});

test('orienta quem nunca entrou e oferece login com retorno à exclusão', async () => {
    fixture.account = null;
    const page = await fixture.render();
    expect(await page.findByRole('heading', { name: 'Você não está conectado' })).toBeTruthy();
    expect(page.getByText(/Se você nunca entrou/)).toBeTruthy();
    const link = page.getByRole('link', { name: 'Entrar para excluir meus dados' });
    const url = new URL(link.getAttribute('href')!, 'http://localhost');
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('returnTo')).toBe('/excluir-conta');
    expect(page.queryByRole('checkbox')).toBeNull();
    expect(fixture.deletions).toHaveLength(0);
});

test('avisa que aplicativos próprios serão removidos para todos', async () => {
    fixture.account = { ...ACCOUNT, applications: ['Agenda UnB', 'Calendário'] };
    const page = await fixture.render();
    expect(await page.findByText('Aplicativos')).toBeTruthy();
    expect(page.getByText(/Agenda UnB, Calendário/)).toBeTruthy();
    expect(page.getByText(/todos os usuários/)).toBeTruthy();
    expect(page.queryByText(/aplicativos conectados perderão/)).toBeNull();
});

test('avisa sobre acessos conectados mesmo sem aplicativos próprios', async () => {
    fixture.account = { ...ACCOUNT, has_connected_applications: true };
    const page = await fixture.render();
    expect(await page.findByText(/aplicativos conectados perderão o acesso/)).toBeTruthy();
    expect(page.queryByText(/deixarão de funcionar/)).toBeNull();
});

test('reúne os avisos quando existem aplicativos conectados e próprios', async () => {
    fixture.account = {
        ...ACCOUNT,
        applications: ['Agenda'],
        has_connected_applications: true
    };
    const page = await fixture.render();
    expect(await page.findByText(/aplicativos conectados perderão o acesso/)).toBeTruthy();
    expect(page.getByText(/Seus aplicativos \(Agenda\)/)).toBeTruthy();
});

test('apresenta erro recuperável ao falhar a consulta da sessão', async () => {
    fixture.sessionFailure = true;
    const page = await fixture.render();
    expect((await page.findByRole('alert')).textContent).toContain(
        'Não foi possível verificar sua sessão'
    );
    fixture.sessionFailure = false;
    fixture.dom.testing.fireEvent.click(page.getByRole('button', { name: 'Tentar novamente' }));
    expect(await page.findByRole('heading', { name: 'Confirmar exclusão' })).toBeTruthy();
});
