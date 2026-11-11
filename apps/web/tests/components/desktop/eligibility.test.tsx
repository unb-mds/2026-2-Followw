import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { renderToString } from 'react-dom/server';

import { useDesktopEligibility } from '#/lib/desktop';

import { desktopBrowser } from '../../helpers/desktop';
import { useDom } from '../../helpers/dom';

const dom = useDom();
let restore: (() => void) | undefined;
afterEach(() => restore?.());

function LayoutProbe() {
    const desktop = useDesktopEligibility();
    const [value, setValue] = useState('');
    return (
        <div data-layout={desktop ? 'desktop' : 'mobile'}>
            <input
                aria-label="Consulta preservada"
                value={value}
                onChange={(event) => setValue(event.target.value)}
            />
        </div>
    );
}

test('SSR e hidratação começam iguais e preservar a árvore mantém a digitação ao redimensionar', async () => {
    const { hydrateRoot } = await import('react-dom/client');
    let width = 1440;
    const device = desktopBrowser(() => width);
    restore = device.restore;
    const html = renderToString(<LayoutProbe />);
    expect(html).toContain('data-layout="mobile"');
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    const errors: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot>;
    await dom.testing.act(async () => {
        root = hydrateRoot(container, <LayoutProbe />, {
            onRecoverableError: (error) => errors.push(error)
        });
    });
    expect(container.firstElementChild?.getAttribute('data-layout')).toBe('desktop');
    const input = dom.testing.within(container).getByRole('textbox');
    dom.testing.fireEvent.change(input, { target: { value: 'Cálculo' } });
    await dom.testing.act(async () => {
        width = 900;
        device.resize();
    });
    expect(container.firstElementChild?.getAttribute('data-layout')).toBe('mobile');
    expect(dom.testing.within(container).getByRole('textbox')).toBe(input);
    expect(input instanceof HTMLInputElement && input.value).toBe('Cálculo');
    expect(errors).toEqual([]);
    await dom.testing.act(async () => root.unmount());
    container.remove();
});
