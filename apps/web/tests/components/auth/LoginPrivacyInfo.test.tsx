import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { LoginPrivacyInfo } from '#/components/auth/LoginPrivacyInfo';

describe('LoginPrivacyInfo', () => {
    test('mantém o resumo visível e oferece uma explicação em diálogo', () => {
        const markup = renderToStaticMarkup(<LoginPrivacyInfo />);

        expect(markup).toContain('não são armazenadas');
        expect(markup).toContain('>Saiba mais</button>');
        expect(markup).toContain('aria-haspopup="dialog"');
        expect(markup).toContain('aria-expanded="false"');
        expect(markup).toContain('data-slot="dialog-trigger"');
    });
});
