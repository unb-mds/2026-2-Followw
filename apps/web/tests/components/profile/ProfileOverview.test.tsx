import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { components } from '#/queries/schema.gen';

import {
    AcademicPerformance,
    EnrollmentDetails,
    ProfileIdentity
} from '#/components/profile/ProfileOverview';

const user: components['schemas']['UserProfile'] = {
    name: 'NOME DISCENTE',
    registration: '202600001',
    photo: null,
    email: 'discente@aluno.unb.br',
    bio: null,
    unity: 'FCTE',
    course: 'ENGENHARIA DE SOFTWARE',
    integralization: 62.5,
    ira: 3.5,
    mp: null,
    level: 'Graduação'
};

describe('ProfileIdentity', () => {
    test('mostra nome e curso legíveis e ícone sem foto', () => {
        const markup = renderToStaticMarkup(<ProfileIdentity user={user} />);
        expect(markup).toContain('Nome Discente');
        expect(markup).toContain('Engenharia de Software · FCTE');
        expect(markup).not.toContain('<img');
    });

    test('mostra foto e bio quando existem', () => {
        const markup = renderToStaticMarkup(
            <ProfileIdentity user={{ ...user, photo: 'https://foto', bio: 'Olá!' }} />
        );
        expect(markup).toContain('src="https://foto"');
        expect(markup).toContain('Olá!');
    });

    test('usa o nome de exibição sem alterar o nome do SIGAA', () => {
        const markup = renderToStaticMarkup(<ProfileIdentity user={user} displayName="Ana" />);
        expect(markup).toContain('>Ana</h1>');
        expect(markup).not.toContain('Nome Discente');

        const original = renderToStaticMarkup(<ProfileIdentity user={user} displayName={null} />);
        expect(original).toContain('Nome Discente');
    });
});

describe('AcademicPerformance', () => {
    test('mostra apenas os índices disponíveis e a integralização', () => {
        const markup = renderToStaticMarkup(<AcademicPerformance user={user} />);
        expect(markup).toContain('3,5000');
        expect(markup).not.toContain('MP');
        expect(markup).toContain('62,5%');
    });

    test('some sem índices nem integralização', () => {
        const markup = renderToStaticMarkup(
            <AcademicPerformance user={{ ...user, ira: null, integralization: null }} />
        );
        expect(markup).toBe('');
    });
});

describe('EnrollmentDetails', () => {
    test('mostra matrícula e e-mail copiáveis', () => {
        const markup = renderToStaticMarkup(<EnrollmentDetails user={user} />);
        expect(markup).toContain('202600001');
        expect(markup).toContain('aria-label="Copiar matrícula"');
        expect(markup).toContain('href="mailto:discente@aluno.unb.br"');
        expect(markup).toContain('aria-label="Copiar e-mail"');
    });

    test('omite e-mail ausente', () => {
        const markup = renderToStaticMarkup(<EnrollmentDetails user={{ ...user, email: null }} />);
        expect(markup).not.toContain('E-mail');
    });
});
