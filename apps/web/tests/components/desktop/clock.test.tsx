import { afterEach, expect, setSystemTime, test } from 'bun:test';

import { useBrasiliaClock } from '#/lib/clock';

import { useDom } from '../../helpers/dom';

const dom = useDom();
afterEach(() => setSystemTime());
function Clock() {
    return <output>{useBrasiliaClock().time}</output>;
}

function DateClock() {
    const now = useBrasiliaClock();
    return (
        <output>
            {now.date} · {now.time}
        </output>
    );
}

test('virada da meia-noite em Brasília atualiza data e hora de todos os consumidores', async () => {
    setSystemTime(new Date('2026-11-11T02:59:00Z'));
    const page = dom.testing.render(
        <>
            <DateClock />
            <DateClock />
        </>
    );
    expect(page.getAllByRole('status').map((node) => node.textContent)).toEqual([
        '2026-11-10 · 23:59',
        '2026-11-10 · 23:59'
    ]);
    setSystemTime(new Date('2026-11-11T03:01:00Z'));
    await dom.testing.act(async () => {
        window.dispatchEvent(new Event('focus'));
    });
    expect(page.getAllByRole('status').map((node) => node.textContent)).toEqual([
        '2026-11-11 · 00:01',
        '2026-11-11 · 00:01'
    ]);
});

test('relógios compartilhados retomam a hora real ao focar e reabrir a aba', async () => {
    setSystemTime(new Date('2026-11-10T11:00:00Z'));
    const page = dom.testing.render(
        <>
            <Clock />
            <Clock />
        </>
    );
    expect(page.getAllByRole('status').map((node) => node.textContent)).toEqual(['08:00', '08:00']);
    setSystemTime(new Date('2026-11-10T12:30:00Z'));
    await dom.testing.act(async () => {
        window.dispatchEvent(new Event('focus'));
    });
    expect(page.getAllByRole('status').map((node) => node.textContent)).toEqual(['09:30', '09:30']);
    setSystemTime(new Date('2026-11-11T01:30:00Z'));
    await dom.testing.act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(page.getAllByRole('status').map((node) => node.textContent)).toEqual(['22:30', '22:30']);
});
