import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { components } from '#/queries/schema.gen';

import {
    AcademicPerformance,
    EnrollmentDetails,
    ProfileIdentity,
    WorkloadSection
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

    test('mostra foto e bio quando existem', () => {
        const markup = renderToStaticMarkup(
            <ProfileIdentity user={{ ...user, photo: 'https://foto', bio: 'Olá!' }} />
        );
        expect(markup).toContain('src="https://foto"');
        expect(markup).toContain('Olá!');
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

describe('WorkloadSection', () => {
    test('mostra as horas pendentes e total quando disponíveis em um dl semântico', () => {
        const markup = renderToStaticMarkup(
            <WorkloadSection
                user={{
                    ...user,
                    workload: {
                        total: 3525,
                        pending_mandatory: 2175,
                        pending_optional: 420,
                        pending_complementary: 0
                    }
                }}
            />
        );
        expect(markup).toContain('Carga Horária');
        expect(markup).toContain('<dl');
        expect(markup).toContain('CH. Obrigatória Pendente');
        expect(markup).toContain('2175 h');
        expect(markup).toContain('CH. Optativa Pendente');
        expect(markup).toContain('420 h');
        expect(markup).toContain('CH. Complementar Pendente');
        expect(markup).toContain('0 h');
        expect(markup).toContain('CH. Total Currículo');
        expect(markup).toContain('3525 h');
        expect(markup).not.toContain('role="progressbar"');
    });

    test('some sem carga horária', () => {
        const markup = renderToStaticMarkup(<WorkloadSection user={{ ...user, workload: null }} />);
        expect(markup).toBe('');
    });
});
