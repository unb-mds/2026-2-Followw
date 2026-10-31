import type { CurriculumModel, FlowGeometry, FlowSubject, Point } from '#/lib/curriculum/types';

import { groupCorequisites } from '#/lib/curriculum/relations';
import { planConnections } from '#/lib/curriculum/routing';

export interface LayoutMetrics {
    cardWidth: { min: number; max: number };
    cardHeight: (subject: FlowSubject) => number;
    // folga lateral descontada da largura disponível
    margin: number;
    minGap: number;
    headings: boolean;
    // cada semestre ocupa a tela, com folga nas pontas para centralizá-lo
    paged: boolean;
    // cartões com texto menor e créditos abreviados
    compact: boolean;
}
export const DESKTOP: LayoutMetrics = {
    cardWidth: { min: 176, max: 208 },
    cardHeight: () => 112,
    margin: 0,
    minGap: 40,
    headings: true,
    paged: false,
    compact: true
};
export const MOBILE: LayoutMetrics = {
    cardWidth: { min: 220, max: 432 },
    cardHeight: (subject) => (subject.hours == null ? 120 : 104),
    margin: 88,
    minGap: 24,
    headings: false,
    paged: true,
    compact: false
};
const PAD = 24;
const HEADING_HEIGHT = 40;

function orderedColumns(model: CurriculumModel) {
    const positions = new Map<string, number>();
    return model.periods.map((period) => {
        const score = (subject: FlowSubject) => {
            const rows = model.edges
                .filter((e) => e.kind === 'prerequisite' && e.target === subject.code)
                .flatMap((e) => {
                    const row = positions.get(e.source);
                    return row === undefined ? [] : [row];
                });
            return rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : Infinity;
        };
        const subjects = groupCorequisites(
            model.subjects
                .filter((s) => s.period === period)
                .toSorted((a, b) => score(a) - score(b) || a.code.localeCompare(b.code)),
            model.edges
        );
        subjects.forEach((subject, row) => positions.set(subject.code, row));
        return subjects;
    });
}

export function layoutCurriculum(
    model: CurriculumModel,
    availableWidth: number,
    metrics: LayoutMetrics = DESKTOP
): FlowGeometry {
    const { periods } = model;
    const columns = orderedColumns(model);
    const plan = planConnections(columns, model.edges, metrics.minGap);
    const gapWidths = [...plan.gapWidths];
    const gapTotal = gapWidths.reduce((a, b) => a + b, 0);
    const { min, max } = metrics.cardWidth;
    const cardWidth = Math.max(
        min,
        Math.min(
            max,
            metrics.paged
                ? availableWidth - metrics.margin
                : (availableWidth - gapTotal - metrics.margin) / Math.max(1, periods.length)
        )
    );
    if (metrics.paged) {
        const side = (availableWidth - cardWidth) / 2;
        gapWidths[0] = Math.max(gapWidths[0], side);
        gapWidths[gapWidths.length - 1] = Math.max(gapWidths.at(-1)!, side);
    }
    const gapStarts: number[] = [0];
    const columnXs: number[] = [];
    let x = 0;
    columns.forEach((_, column) => {
        x += gapWidths[column];
        columnXs.push(x);
        x += cardWidth;
        gapStarts.push(x);
    });
    const width = x + (gapWidths.at(-1) ?? PAD);
    const heights = columns.map((column) => column.map(metrics.cardHeight));
    const rowTops: number[] = [];
    let y = metrics.headings ? HEADING_HEIGHT : 0;
    plan.gutterHeights.forEach((gutter, row) => {
        y += gutter;
        rowTops.push(y);
        y += Math.max(0, ...heights.map((column) => column[row] ?? 0));
    });
    const nodes = columns.flatMap((column, col) =>
        column.map((subject, row) => ({
            subject,
            x: columnXs[col],
            y: rowTops[row],
            width: cardWidth,
            height: heights[col][row],
            row,
            column: col
        }))
    );
    return {
        width,
        height: y + PAD,
        nodes,
        edges: plan.route(nodes, gapStarts, rowTops),
        columns: periods.map((period, column) => ({ period, x: columnXs[column] + cardWidth / 2 }))
    };
}

export function pathData(points: Point[]) {
    return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
}
