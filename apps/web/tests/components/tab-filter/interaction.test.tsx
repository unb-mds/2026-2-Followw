import { expect, test } from 'bun:test';

import { TabFilter } from '#/components/TabFilter';

import { useDom } from '../../helpers/dom';

const dom = useDom();
const options = ['all', 'news', 'topic'] as const;

const render = (value: (typeof options)[number], shifted = false) => (
    <div style={{ paddingTop: shifted ? 800 : 0 }}>
        <TabFilter label="Tipos" value={value} options={options} onChange={() => {}} />
    </div>
);

test('mantém o indicador no grupo ao alternar filtros e mudar sua posição na página', async () => {
    const page = dom.testing.render(render('all'));
    const group = page.getByRole('group', { name: 'Tipos' });
    const buttons = page.getAllByRole('button');
    for (const [index, button] of buttons.entries()) {
        Object.defineProperties(button, {
            offsetLeft: { configurable: true, value: index * 80 },
            offsetWidth: { configurable: true, value: 76 }
        });
    }
    const indicator = group.querySelector(':scope > [aria-hidden="true"]');
    expect(indicator).not.toBeNull();
    page.rerender(render('news', true));
    expect(page.getByRole('button', { name: 'news' }).getAttribute('aria-pressed')).toBe('true');
    await dom.testing.waitFor(() => {
        expect(indicator?.getAttribute('style')).toContain('translateX(80px)');
    });
    expect(group.querySelector(':scope > [aria-hidden="true"]')).toBe(indicator);
    expect(page.getByRole('button', { name: 'all' }).getAttribute('aria-pressed')).toBe('false');
});

test('cliques rápidos mantêm o valor selecionado e continuam emitindo mudanças', () => {
    const changes: string[] = [];
    const page = dom.testing.render(
        <TabFilter
            label="Tipos"
            value="all"
            options={options}
            onChange={(value) => changes.push(value)}
        />
    );
    for (const name of ['news', 'topic', 'all']) {
        dom.testing.fireEvent.click(page.getByRole('button', { name }));
    }
    expect(changes).toEqual(['news', 'topic', 'all']);
    expect(page.getByRole('button', { name: 'all' }).getAttribute('aria-pressed')).toBe('true');
});
