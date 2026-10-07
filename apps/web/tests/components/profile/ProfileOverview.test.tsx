import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { components } from '#/queries/schema.gen';

import {
    AcademicPerformance,
    ProfileIdentity,
    ProgressSection
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
    workload: null,
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

    test('mostra matrícula copiável ao lado do curso, sem e-mail', () => {
        const markup = renderToStaticMarkup(<ProfileIdentity user={user} />);
        expect(markup).toContain('202600001');
        expect(markup).toContain('aria-label="Copiar matrícula"');
        expect(markup).not.toContain('mailto:');
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
    test('mostra apenas os índices disponíveis', () => {
        const markup = renderToStaticMarkup(<AcademicPerformance user={user} />);
        expect(markup).toContain('3,500');
        expect(markup).not.toContain('MP');
        expect(markup).not.toContain('Integralização');
    });

    test('some sem índices', () => {
        const markup = renderToStaticMarkup(<AcademicPerformance user={{ ...user, ira: null }} />);
        expect(markup).toBe('');
    });
});

describe('ProgressSection', () => {
    const workload = {
        total: 3525,
        pending_mandatory: 2175,
        pending_optional: 420,
        pending_complementary: 0
    };

    test('junta a integralização e as horas pendentes em um dl semântico', () => {
        const markup = renderToStaticMarkup(<ProgressSection user={{ ...user, workload }} />);
        expect(markup).toContain('Progresso');
        expect(markup).not.toContain('Carga Horária');
        expect(markup).toContain('Integralização');
        expect(markup).toContain('62,5%');
        expect(markup).toContain('<dl');
        expect(markup).toContain('CH. Obrigatória Pendente');
        expect(markup).toContain('2175h');
        expect(markup).toContain('(145 créditos)');
        expect(markup).toContain('CH. Optativa Pendente');
        expect(markup).toContain('420h');
        expect(markup).toContain('(28 créditos)');
        expect(markup).toContain('CH. Complementar Pendente');
        expect(markup).toContain('0h');
        expect(markup).not.toContain('(0 créditos)');
        expect(markup).toContain('CH. Total Currículo');
        expect(markup).toContain('3525h');
        expect(markup).not.toContain('(235 créditos)');
    });

    test('mostra só a integralização sem carga horária', () => {
        const markup = renderToStaticMarkup(<ProgressSection user={user} />);
        expect(markup).toContain('62,5%');
        expect(markup).not.toContain('<dl');
    });

    test('mostra só a carga horária sem integralização', () => {
        const markup = renderToStaticMarkup(
            <ProgressSection user={{ ...user, integralization: null, workload }} />
        );
        expect(markup).not.toContain('Integralização');
        expect(markup).toContain('3525h');
    });

    test('some sem integralização nem carga horária', () => {
        const markup = renderToStaticMarkup(
            <ProgressSection user={{ ...user, integralization: null }} />
        );
        expect(markup).toBe('');
    });
});
