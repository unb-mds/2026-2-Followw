import { describe, expect, test } from 'bun:test';

import type { FlowGeometry } from '#/lib/curriculum/types';

import { DESKTOP, layoutCurriculum, MOBILE } from '#/lib/curriculum/geometry';
import { groupBy } from '#/lib/curriculum/graph';
import { normalizeCurriculum } from '#/lib/curriculum/model';
import { connectionSegments } from '#/lib/curriculum/segments';

import { curriculum as named, type RawCurriculum } from '../../helpers/curriculum';

const matrix: RawCurriculum = {
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
const model = normalizeCurriculum(named(matrix));
const DESKTOP_CARD_HEIGHT = 112;
const DESKTOP_CARD_MAX_WIDTH = DESKTOP.cardWidth.max;
const mobile = (curriculum: Parameters<typeof layoutCurriculum>[0], width: number) =>
    layoutCurriculum(curriculum, width, MOBILE);
function expectNoOverlap(segments: ReturnType<typeof connectionSegments>['segments']) {
    for (let index = 0; index < segments.length; index++) {
        const [a, b] = segments[index].points;
        for (const {
            points: [c, d]
        } of segments.slice(index + 1)) {
            const overlaps =
                a.y === b.y && c.y === d.y && a.y === c.y
                    ? Math.min(b.x, d.x) > Math.max(a.x, c.x)
                    : a.x === b.x && c.x === d.x && a.x === c.x
                      ? Math.min(b.y, d.y) > Math.max(a.y, c.y)
                      : false;
            expect(overlaps).toBe(false);
        }
    }
}
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
        const curriculum = normalizeCurriculum(
            named({
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
                    {
                        period: 3,
                        subjects: [{ code: 'Z', name: 'Destino', prerequisites: [['A1']] }]
                    }
                ]
            })
        );
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
            normalizeCurriculum(
                named({
                    ...matrix,
                    periods: [
                        { period: 1, subjects: [{ code: 'A', name: 'Origem' }] },
                        { period: 2, subjects: [] },
                        {
                            period: 3,
                            subjects: [{ code: 'B', name: 'Destino', prerequisites: [['A']] }]
                        }
                    ]
                })
            ),
            1440
        );
        expect(geometry.edges[0].points).toHaveLength(2);
        assertRoutes(geometry);
    });
    test('saída de um cartão não se sobrepõe à chegada no cartão ao lado', () => {
        const geometry = layoutCurriculum(
            normalizeCurriculum(
                named({
                    ...matrix,
                    periods: [
                        {
                            period: 1,
                            subjects: [
                                { code: 'L', name: 'Vizinha' },
                                { code: 'S', name: 'Origem' }
                            ]
                        },
                        {
                            period: 2,
                            subjects: [
                                { code: 'T', name: 'Destino', prerequisites: [['S']] },
                                { code: 'M', name: 'Meio' }
                            ]
                        },
                        {
                            period: 3,
                            subjects: [{ code: 'X', name: 'Longe', prerequisites: [['L']] }]
                        }
                    ]
                })
            ),
            1440
        );
        expectNoOverlap(connectionSegments(geometry.edges).segments);
        assertRoutes(geometry);
    });
    test('mantém o desvio necessário quando uma matéria bloqueia a linha direta', () => {
        const geometry = layoutCurriculum(
            normalizeCurriculum(
                named({
                    ...matrix,
                    periods: [
                        { period: 1, subjects: [{ code: 'A', name: 'Origem' }] },
                        { period: 2, subjects: [{ code: 'M', name: 'Obstáculo' }] },
                        {
                            period: 3,
                            subjects: [{ code: 'B', name: 'Destino', prerequisites: [['A']] }]
                        }
                    ]
                })
            ),
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
    test('cada pré-requisito chega com sua própria seta, e só destinos lotados juntam as setas', () => {
        const geometry = layoutCurriculum(model, 1440);
        let expected = 0;
        for (const node of geometry.nodes) {
            const routes = geometry.edges.filter(
                ({ edge }) => edge.target === node.subject.code && edge.kind === 'prerequisite'
            );
            const sources = new Set(routes.map(({ edge }) => edge.source)).size;
            const separate = sources <= 6;
            const ports = routes.map(({ edge, points }) => [edge.source, points.at(-1)!] as const);
            // origem repetida em grupos alternativos usa a mesma seta
            expect(new Set(ports.map(([, { y }]) => y)).size).toBe(separate ? sources : 1);
            for (const [source, { y }] of ports)
                expect(
                    ports.filter(([other]) => other === source).every(([, p]) => p.y === y)
                ).toBe(true);
            expected += separate ? sources : 1;
            for (const [, { x, y }] of ports) {
                expect(x).toBe(node.x);
                expect(y).toBeGreaterThan(node.y);
                expect(y).toBeLessThan(node.y + node.height);
            }
        }
        const prerequisites = geometry.edges.filter(({ edge }) => edge.kind === 'prerequisite');
        // o modelo tem destinos lotados e setas separadas
        expect(expected).toBeGreaterThan(geometry.nodes.length);
        expect(expected).toBeLessThan(prerequisites.length);
        expect(connectionSegments(prerequisites).arrows).toHaveLength(expected);
        expect(geometry.nodes.every((node) => node.height === DESKTOP_CARD_HEIGHT)).toBe(true);
    });
    test('origem repetida em alternativas chega ao destino numa única seta', () => {
        const repeated = normalizeCurriculum(
            named({
                ...matrix,
                periods: [
                    {
                        period: 1,
                        subjects: ['A', 'B', 'C'].map((code) => ({ code, name: 'Disciplina' }))
                    },
                    {
                        period: 2,
                        subjects: [
                            {
                                code: 'D',
                                name: 'Destino',
                                prerequisites: [
                                    ['A', 'B'],
                                    ['A', 'C']
                                ]
                            }
                        ]
                    }
                ]
            })
        );
        const geometry = layoutCurriculum(repeated, 1440);
        expect(geometry.edges).toHaveLength(4);
        const { arrows } = connectionSegments(geometry.edges);
        expect(arrows).toHaveLength(3);
        expect(new Set(geometry.edges.map(({ points }) => points.at(-1)!.y)).size).toBe(3);
        assertRoutes(geometry);
    });
    test('trechos compartilhados são desenhados uma única vez e redes diferentes nunca se sobrepõem', () => {
        const geometry = layoutCurriculum(model, 1440);
        const { segments } = connectionSegments(geometry.edges);
        const rawCount = geometry.edges.reduce((count, edge) => count + edge.points.length - 1, 0);
        expect(segments.length).toBeLessThan(rawCount);
        expectNoOverlap(segments);
    });
    test('mobile põe todos os semestres lado a lado, cada um centralizável na tela', () => {
        const width = 390;
        const geometry = mobile(model, width);
        const [card] = geometry.nodes;
        expect(geometry.nodes.every((n) => n.width === card.width)).toBe(true);
        expect(geometry.columns.map((c) => c.period)).toEqual(model.periods);
        for (const { x } of geometry.columns) {
            expect(x - width / 2).toBeGreaterThanOrEqual(0);
            expect(x + width / 2).toBeLessThanOrEqual(geometry.width);
        }
        expect(geometry.edges).toHaveLength(model.edges.length);
        assertRoutes(geometry);
        for (const { points } of geometry.edges) {
            expect(points[0].x).toBeGreaterThan(0);
            expect(points.at(-1)!.x).toBeLessThan(geometry.width);
        }
    });
    test('mobile deixa à mostra um pedaço dos semestres vizinhos', () => {
        // corredores largos do modelo de teste exigem tela larga para não chegar à largura mínima
        const width = 1000;
        const geometry = mobile(model, width);
        for (const [column, { x }] of geometry.columns.entries()) {
            const left = x - width / 2;
            const neighbors = geometry.nodes.filter((n) => Math.abs(n.column - column) === 1);
            expect(neighbors.length).toBeGreaterThan(0);
            for (const node of neighbors) {
                const visible =
                    node.column < column ? node.x + node.width - left : left + width - node.x;
                expect(visible).toBeGreaterThanOrEqual(MOBILE.peek);
            }
        }
    });
    test('linhas que saem da mesma matéria compartilham a cor, e origens vizinhas não', () => {
        const geometry = layoutCurriculum(model, 1440);
        const incoming = groupBy(
            geometry.edges.map((route) => [route.edge.target, route] as const)
        );
        const bySource = new Map<string, Set<number>>();
        for (const { edge, color } of geometry.edges) {
            expect(color).toBeGreaterThanOrEqual(0);
            expect(color).toBeLessThan(5);
            // destinos lotados ficam com a cor deles
            if (incoming.get(edge.target)!.length > 6) continue;
            bySource.set(edge.source, (bySource.get(edge.source) ?? new Set()).add(color));
        }
        expect(bySource.size).toBeGreaterThan(0);
        expect([...bySource.values()].every((colors) => colors.size === 1)).toBe(true);
        const colorOf = (code: string) => [...bySource.get(code)!][0];
        for (const node of geometry.nodes) {
            const below = geometry.nodes.find(
                (n) => n.column === node.column && n.row === node.row + 1
            );
            if (bySource.has(node.subject.code) && below && bySource.has(below.subject.code))
                expect(colorOf(node.subject.code)).not.toBe(colorOf(below.subject.code));
        }
    });
    test('mobile acomoda quatro matérias em uma área compacta e mantém os correquisitos alinhados', () => {
        const compact = normalizeCurriculum(
            named({
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
            })
        );
        for (const width of [320, 390]) {
            const geometry = mobile(compact, width);
            expect(geometry.nodes).toHaveLength(4);
            expect(geometry.height).toBeLessThanOrEqual(592);
            expect(geometry.width).toBeLessThanOrEqual(width);
            for (const node of geometry.nodes) {
                expect(node.x).toBeGreaterThan(0);
                expect(node.x + node.width).toBeLessThan(width);
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
        const paired = normalizeCurriculum(
            named({
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
            })
        );
        for (const geometry of [layoutCurriculum(paired, 1440), mobile(paired, 390)]) {
            expect(geometry.nodes.map((n) => n.subject.code)).toEqual(['A', 'Z', 'B']);
            expect(geometry.edges).toHaveLength(1);
            const points = geometry.edges[0].points;
            expect(points[0].x).toBe(points.at(-1)!.x);
            expect(Math.abs(points[0].y - points.at(-1)!.y)).toBeGreaterThan(0);
            expect(geometry.edges[0].edge.kind).toBe('corequisite');
            assertRoutes(geometry);
        }
    });
    test('correquisitos empilhados que dividem um cartão não se sobrepõem', () => {
        const stacked = normalizeCurriculum(
            named({
                ...matrix,
                periods: [
                    {
                        period: 1,
                        subjects: [
                            { code: 'A', name: 'Primeira', corequisites: [['B'], ['C']] },
                            { code: 'B', name: 'Segunda' },
                            { code: 'C', name: 'Terceira' }
                        ]
                    }
                ]
            })
        );
        for (const geometry of [layoutCurriculum(stacked, 1440), mobile(stacked, 390)]) {
            expect(geometry.edges.length).toBeGreaterThan(1);
            expectNoOverlap(connectionSegments(geometry.edges).segments);
            assertRoutes(geometry);
        }
    });
    test('vários correquisitos não adjacentes usam os corredores sem cruzar cartões', () => {
        const dense = normalizeCurriculum(
            named({
                ...matrix,
                periods: [
                    {
                        period: 1,
                        subjects: Array.from({ length: 6 }, (_item, index) => ({
                            code: `A${index}`,
                            name: 'Disciplina',
                            corequisites: [
                                Array.from({ length: 6 }, (_other, other) => `A${other}`)
                            ]
                        }))
                    }
                ]
            })
        );
        for (const geometry of [layoutCurriculum(dense, 1440), mobile(dense, 1440)]) {
            expect(geometry.edges).toHaveLength(15);
            assertRoutes(geometry);
        }
    });
    test('desktop compacto mantém largura e altura legíveis com mais cartões na área disponível', () => {
        const compact = layoutCurriculum(
            normalizeCurriculum(
                named({
                    ...matrix,
                    periods: Array.from({ length: 10 }, (_item, index) => ({
                        period: index + 1,
                        subjects: [{ code: `A${index}`, name: 'Disciplina', hours: 60 }]
                    }))
                })
            ),
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
        const curriculum = normalizeCurriculum(
            named({
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
            })
        );
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
        const column = mobile(curriculum, 390);
        expect(column.nodes[0].height).toBeLessThanOrEqual(160);
        expect(column.edges).toHaveLength(80);
        assertRoutes(column);
    });
    test('centraliza cada título de semestre sobre seus cartões em diferentes larguras', () => {
        for (const width of [1024, 1440, 2560]) {
            const geometry = layoutCurriculum(model, width);
            for (const heading of geometry.columns) {
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
        const empty = layoutCurriculum(
            normalizeCurriculum(named({ ...matrix, periods: [] })),
            1200
        );
        expect(empty.nodes).toEqual([]);
        expect(Number.isFinite(empty.height)).toBe(true);
        expect(Number.isFinite(empty.width)).toBe(true);
    });
});
