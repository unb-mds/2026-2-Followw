import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { BrandIntro } from '#/components/BrandIntro';

describe('BrandIntro', () => {
    test('renderiza as 4 asas geométricas, contêiner tipográfico e nome Followw quando force=true', () => {
        const markup = renderToStaticMarkup(<BrandIntro force />);

        expect(markup).toContain('intro-wing-tl');
        expect(markup).toContain('intro-wing-tr');
        expect(markup).toContain('intro-wing-bl');
        expect(markup).toContain('intro-wing-br');
        expect(markup).toContain('intro-wordmark-container');
        expect(markup).toContain('intro-wordmark-text');
        expect(markup).toContain('Followw');
    });

    test('contém os keyframes de precisão de identidade corporativa', () => {
        const markup = renderToStaticMarkup(<BrandIntro force />);

        expect(markup).toContain('intro-wing-tl');
        expect(markup).toContain('intro-wordmark-reveal');
        expect(markup).toContain('intro-text-slide');
        expect(markup).toContain('intro-shimmer-sweep');
    });
});
