import { describe, expect, test } from 'bun:test';

import type { FlowGeometry } from '#/lib/curriculum/geometry';
import type { CourseCurriculum } from '#/queries/curriculum';

import {
    DESKTOP_CARD_HEIGHT,
    DESKTOP_CARD_MAX_WIDTH,
    layoutCurriculum
} from '#/lib/curriculum/geometry';
import { normalizeCurriculum } from '#/lib/curriculum/model';
import { connectionSegments } from '#/lib/curriculum/segments';

const matrix: CourseCurriculum = {
    sigaa_id: 1,
    code: '01',
    course_id: 42,
    entry_semester: '2024.2',
    valid_from: '2024.1',
    matrix: 'Densa',
    shift: null,
    periods: Array.from({ length: 6 }, (_period, column) => ({
        period: column + 1,
        subjects: Array.from({ length: column + 2 }, (_subject, row) => ({
            code: `C${column}R${row}`,
            name: 'Disciplina com nome longo para verificar a dimensão dos cartões e dos corredores',
            hours: 60,
            prerequisites: column
                ? [
                      Array.from(
                          { length: column + 1 },
                          (_prerequisite, source) => `C${column - 1}R${source}`
                      ),
                      ['C0R0']
                  ]
                : row
                  ? [['C0R0'], ['C5R0']]
                  : [['C0R0']]
        }))
    })),
    complementary: []
};
const model = normalizeCurriculum(matrix);
function assertRoutes(geometry: FlowGeometry) {
    for (const { points } of geometry.edges) {
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1];
            const b = points[i];
            expect(a.x === b.x || a.y === b.y).toBe(true);
            for (const card of geometry.nodes) {
                const crosses =
                    a.x === b.x
                        ? a.x > card.x &&
                          a.x < card.x + card.width &&
                          Math.max(a.y, b.y) > card.y &&
                          Math.min(a.y, b.y) < card.y + card.height
                        : a.y > card.y &&
                          a.y < card.y + card.height &&
                          Math.max(a.x, b.x) > card.x &&
                          Math.min(a.x, b.x) < card.x + card.width;
                expect(crosses).toBe(false);
            }
        }
    }
}

describe('geometria do fluxo', () => {
    test('usa o corredor entre as matérias intermediárias sem subir além do destino', () => {
        const curriculum = normalizeCurriculum({
            ...matrix,
            periods: [
                {
                    period: 1,
                    subjects: [
                        { code: 'A0', name: 'Base' },
                        { code: 'A1', name: 'Origem' }
                    ]
                },
                {
                    period: 2,
                    subjects: [
                        { code: 'M0', name: 'Intermediária superior' },
                        { code: 'M1', name: 'Intermediária inferior' }
                    ]
                },
                { period: 3, subjects: [{ code: 'Z', name: 'Destino', prerequisites: [['A1']] }] }
            ]
        });
        for (const width of [1024, 1440, 2560]) {
            const geometry = layoutCurriculum(curriculum, width);
            const { points } = geometry.edges[0];
            const from = points[0];
            const to = points.at(-1)!;
            const length = points
                .slice(1)
                .reduce(
                    (sum, point, index) =>
                        sum +
                        Math.abs(point.x - points[index].x) +
                        Math.abs(point.y - points[index].y),
                    0
                );
            expect(length).toBe(Math.abs(to.x - from.x) + Math.abs(to.y - from.y));
            assertRoutes(geometry);
        }
    });
    test('liga diretamente matérias alinhadas quando o semestre intermediário está livre', () => {
        const geometry = layoutCurriculum(
            normalizeCurriculum({
                ...matrix,
                periods: [
                    { period: 1, subjects: [{ code: 'A', name: 'Origem' }] },
                    { period: 2, subjects: [] },
                    {
                        period: 3,
                        subjects: [{ code: 'B', name: 'Destino', prerequisites: [['A']] }]
                    }
                ]
            }),
            1440
        );
        expect(geometry.edges[0].points).toHaveLength(2);
        assertRoutes(geometry);
    });
    test('mantém o desvio necessário quando uma matéria bloqueia a linha direta', () => {
        const geometry = layoutCurriculum(
            normalizeCurriculum({
                ...matrix,
                periods: [
                    { period: 1, subjects: [{ code: 'A', name: 'Origem' }] },
                    { period: 2, subjects: [{ code: 'M', name: 'Obstáculo' }] },
                    {
                        period: 3,
                        subjects: [{ code: 'B', name: 'Destino', prerequisites: [['A']] }]
                    }
                ]
            }),
            1440
        );
        expect(geometry.edges[0].points.length).toBeGreaterThan(2);
        assertRoutes(geometry);
    });
    test('todas as conexões densas, alternativas, reversas e do mesmo período são ortogonais e evitam cartões', () => {
        const geometry = layoutCurriculum(model, 1440);
        expect(geometry.edges).toHaveLength(model.edges.length);
        assertRoutes(geometry);
        expect(geometry.nodes.every((node) => node.width >= 160)).toBe(true);
    });
    test('redimensionamento preserva a ordem e não perde arestas', () => {
        const normal = layoutCurriculum(model, 1440);
        const wide = layoutCurriculum(model, 4000);
        expect(wide.nodes.map((n) => [n.subject.code, n.row, n.column])).toEqual(
            normal.nodes.map((n) => [n.subject.code, n.row, n.column])
        );
        assertRoutes(wide);
        expect(layoutCurriculum(model, 1440)).toEqual(normal);
    });
    test('relações com o mesmo destino compartilham a chegada sem aumentar o cartão', () => {
        const geometry = layoutCurriculum(model, 1440);
        for (const subject of model.subjects) {
            const ports = geometry.edges
                .filter((edge) => edge.edge.target === subject.code)
                .map((edge) => edge.points.at(-1)!.y);
            expect(new Set(ports).size).toBeLessThanOrEqual(1);
        }
        expect(geometry.nodes.every((node) => node.height === DESKTOP_CARD_HEIGHT)).toBe(true);
    });
    test('trechos compartilhados são desenhados uma única vez sem sobreposição de segmentos colineares', () => {
        const geometry = layoutCurriculum(model, 1440);
        const { segments } = connectionSegments(geometry.edges);
        const rawCount = geometry.edges.reduce((count, edge) => count + edge.points.length - 1, 0);
        expect(segments.length).toBeLessThan(rawCount);
        for (let index = 0; index < segments.length; index++) {
            const first = segments[index];
            for (const second of segments.slice(index + 1)) {
                if (first.kind !== second.kind || first.alternative !== second.alternative)
                    continue;
                const [a, b] = first.points;
                const [c, d] = second.points;
                const overlaps =
                    a.y === b.y && c.y === d.y && a.y === c.y
                        ? Math.min(b.x, d.x) > Math.max(a.x, c.x)
                        : a.x === b.x && c.x === d.x && a.x === c.x
                          ? Math.min(b.y, d.y) > Math.max(a.y, c.y)
                          : false;
                expect(overlaps).toBe(false);
            }
        }
    });
    test('mobile só mostra o semestre selecionado e continua somente relações reais', () => {
        const geometry = layoutCurriculum(model, 390, 2);
        expect(geometry.nodes.every((n) => n.subject.period === 2)).toBe(true);
        expect(geometry.edges.map((e) => e.edge.id)).toEqual(
            model.edges
                .filter(
                    (e) =>
                        model.byCode.get(e.source)!.period === 2 ||
                        model.byCode.get(e.target)!.period === 2
                )
                .map((e) => e.id)
        );
        assertRoutes(geometry);
        expect(geometry.edges.some((e) => e.points[0].x === 0)).toBe(true);
        expect(geometry.edges.some((e) => e.points.at(-1)!.x === geometry.width)).toBe(true);
    });
    test('mobile acomoda quatro matérias em uma área compacta e mantém os correquisitos alinhados', () => {
        const compact = normalizeCurriculum({
            ...matrix,
            periods: [
                {
                    period: 1,
                    subjects: Array.from({ length: 4 }, (_, index) => ({
                        code: `A${index}`,
                        name: 'Disciplina com nome longo que ocupa três linhas no cartão',
                        hours: index === 3 ? null : 60,
                        corequisites: index === 0 ? [['A1']] : []
                    }))
                }
            ]
        });
        for (const width of [320, 390]) {
            const geometry = layoutCurriculum(compact, width, 1);
            expect(geometry.nodes).toHaveLength(4);
            expect(geometry.height).toBeLessThanOrEqual(592);
            expect(geometry.width).toBeLessThanOrEqual(width);
            for (const node of geometry.nodes) {
                expect(node.x).toBeGreaterThanOrEqual(44);
                expect(node.x + node.width).toBeLessThanOrEqual(width - 44);
            }
            expect(geometry.edges).toHaveLength(1);
            assertRoutes(geometry);
            for (const [index, node] of geometry.nodes.entries()) {
                const next = geometry.nodes[index + 1];
                if (next) expect(node.y + node.height).toBeLessThan(next.y);
            }
        }
    });
    test('correquisitos ficam próximos na vertical, sem linhas atravessando os cartões', () => {
        const paired = normalizeCurriculum({
            ...matrix,
            periods: [
                {
                    period: 1,
                    subjects: [
                        { code: 'A', name: 'Teoria', corequisites: [['Z']] },
                        { code: 'B', name: 'Outra disciplina' },
                        { code: 'Z', name: 'Prática', corequisites: [['A']] }
                    ]
                }
            ]
        });
        for (const mobilePeriod of [undefined, 1]) {
            const geometry = layoutCurriculum(paired, mobilePeriod ? 390 : 1440, mobilePeriod);
            expect(geometry.nodes.map((n) => n.subject.code)).toEqual(['A', 'Z', 'B']);
            expect(geometry.edges).toHaveLength(1);
            const points = geometry.edges[0].points;
            expect(points[0].x).toBe(points.at(-1)!.x);
            expect(Math.abs(points[0].y - points.at(-1)!.y)).toBeGreaterThan(0);
            expect(geometry.edges[0].label).toContain('correquisito');
            assertRoutes(geometry);
        }
    });
    test('vários correquisitos não adjacentes usam os corredores sem cruzar cartões', () => {
        const dense = normalizeCurriculum({
            ...matrix,
            periods: [
                {
                    period: 1,
                    subjects: Array.from({ length: 6 }, (_item, index) => ({
                        code: `A${index}`,
                        name: 'Disciplina',
                        corequisites: [Array.from({ length: 6 }, (_other, other) => `A${other}`)]
                    }))
                }
            ]
        });
        for (const mobilePeriod of [undefined, 1]) {
            const geometry = layoutCurriculum(dense, 1440, mobilePeriod);
            expect(geometry.edges).toHaveLength(15);
            assertRoutes(geometry);
        }
    });
    test('desktop compacto mantém largura e altura legíveis com mais cartões na área disponível', () => {
        const compact = layoutCurriculum(
            normalizeCurriculum({
                ...matrix,
                periods: Array.from({ length: 10 }, (_item, index) => ({
                    period: index + 1,
                    subjects: [{ code: `A${index}`, name: 'Disciplina', hours: 60 }]
                }))
            }),
            1440
        );
        expect(
            compact.nodes.every(
                (node) =>
                    node.width <= DESKTOP_CARD_MAX_WIDTH && node.height === DESKTOP_CARD_HEIGHT
            )
        ).toBe(true);
    });
    test('centenas de relações alternativas não geram cartões gigantes ou corredores por relação', () => {
        const codes = Array.from({ length: 80 }, (_, index) => `A${index}`);
        const curriculum = normalizeCurriculum({
            ...matrix,
            periods: [
                {
                    period: 1,
                    subjects: codes.map((code) => ({ code, name: 'Disciplina', hours: 60 }))
                },
                {
                    period: 2,
                    subjects: [
                        {
                            code: 'DESTINO',
                            name: 'Nome muito longo '.repeat(30),
                            prerequisites: codes.map((code) => [code])
                        }
                    ]
                }
            ]
        });
        const geometry = layoutCurriculum(curriculum, 1440);
        expect(geometry.edges).toHaveLength(80);
        expect(
            geometry.nodes.every(
                (node) =>
                    node.height === DESKTOP_CARD_HEIGHT && node.width <= DESKTOP_CARD_MAX_WIDTH
            )
        ).toBe(true);
        expect(geometry.width).toBeLessThan(600);
        expect(geometry.nodes[0].y).toBeLessThan(100);
        const { segments, arrows } = connectionSegments(geometry.edges);
        expect(arrows.filter((arrow) => arrow.endArrow)).toHaveLength(1);
        expect(segments.length).toBeLessThan(100);
        assertRoutes(geometry);
        const mobile = layoutCurriculum(curriculum, 390, 2);
        expect(mobile.nodes[0].height).toBeLessThanOrEqual(160);
        expect(mobile.edges).toHaveLength(80);
        assertRoutes(mobile);
    });
    test('centraliza cada título de semestre sobre seus cartões em diferentes larguras', () => {
        for (const width of [1024, 1440, 2560]) {
            const geometry = layoutCurriculum(model, width);
            for (const heading of geometry.headings) {
                const cards = geometry.nodes.filter(
                    (node) => node.subject.period === heading.period
                );
                expect(cards.length).toBeGreaterThan(0);
                for (const card of cards) {
                    expect(heading.x).toBe(card.x + card.width / 2);
                }
            }
        }
    });
    test('matriz vazia produz dimensões finitas sem inventar componentes', () => {
        const empty = layoutCurriculum(normalizeCurriculum({ ...matrix, periods: [] }), 1200);
        expect(empty.nodes).toEqual([]);
        expect(Number.isFinite(empty.height)).toBe(true);
        expect(Number.isFinite(empty.width)).toBe(true);
    });
});
