import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { PageStateProvider, usePageState } from '#/components/PageState';

function Value() {
    const [value] = usePageState('filters', false);
    return <span>{String(value)}</span>;
}

describe('usePageState', () => {
    test('começa com o valor inicial', () => {
        const markup = renderToStaticMarkup(
            <PageStateProvider page="/ru">
                <Value />
            </PageStateProvider>
        );

        expect(markup).toBe('<span>false</span>');
    });

    test('exige o provider', () => {
        expect(() => renderToStaticMarkup(<Value />)).toThrow();
    });
});
