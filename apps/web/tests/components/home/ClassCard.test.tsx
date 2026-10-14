import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ClassCard } from '#/components/home/ClassCard';

const classroom = {
    title: 'Cálculo 1',
    code: 'MAT0025',
    time: '08:00 - 09:50',
    location: 'ICC Norte',
    classNumber: '02'
};

describe('ClassCard', () => {
    test.each([
        ['SS', 'info'],
        ['MS', 'primary'],
        ['MM', 'warning'],
        ['MI', 'destructive'],
        ['II', 'destructive'],
        ['SR', 'destructive']
    ] as const)('exibe apenas %s antes do local com a cor %s', (grade, color) => {
        const markup = renderToStaticMarkup(<ClassCard {...classroom} grade={grade} />);

        expect(markup).not.toContain('Menção');
        expect(markup).toContain(`text-${color}`);
        expect(markup).not.toContain(`bg-${color}/10`);
        expect(markup).not.toContain('data-slot="badge"');
        expect(markup).toMatch(new RegExp(`<span[^>]*>${grade}</span> · ICC Norte</span>`));
        expect(markup.match(new RegExp(`<span[^>]*>${grade}</span>`))?.[0]).not.toContain(
            'ml-auto'
        );
    });

    test.each([null, undefined])('omite a menção quando é %s', (grade) => {
        const markup = renderToStaticMarkup(<ClassCard {...classroom} grade={grade} />);

        expect(markup).not.toContain('Menção');
        expect(markup).not.toContain('data-slot="badge"');
        expect(markup).not.toContain('<span aria-hidden="true">·</span>');
    });

    test('mantém disciplina, horário e local sem oferecer ações ausentes', () => {
        const markup = renderToStaticMarkup(<ClassCard {...classroom} />);

        for (const value of Object.values(classroom)) expect(markup).toContain(value);
        expect(markup).not.toContain('<button');
    });

    test('omite local e ícone quando não há local', () => {
        const markup = renderToStaticMarkup(<ClassCard {...classroom} location={undefined} />);

        expect(markup).not.toContain('ICC Norte');
        expect(markup).not.toContain('lucide-map-pin');
        expect(markup).toContain('MAT0025 · T02');
    });

    test.each([
        ['in_progress', 'Em andamento'],
        ['next', 'Próxima'],
        ['warning', 'Atenção']
    ] as const)('mantém o status %s legível', (status, label) => {
        const markup = renderToStaticMarkup(<ClassCard {...classroom} status={status} />);

        expect(markup).toContain(label);
    });

    test('mantém textos de status personalizados', () => {
        const markup = renderToStaticMarkup(
            <ClassCard {...classroom} status="in_progress" statusText="Aula em curso" />
        );

        expect(markup).toContain('Aula em curso');
        expect(markup).not.toContain('Em andamento');
    });

    test('oferece botões independentes e acessíveis para abrir turma e mapa', () => {
        const markup = renderToStaticMarkup(
            <ClassCard {...classroom} onClick={() => undefined} onLocationClick={() => undefined} />
        );

        expect(markup).toContain('aria-label="Cálculo 1"');
        expect(markup).toContain('aria-label="Ver mapa da sala"');
        expect(markup.match(/<button\b/g)).toHaveLength(2);
        expect(markup).not.toMatch(/<button\b[^>]*>[^]*?<button\b[^]*?<\/button>[^]*?<\/button>/);
    });
});
