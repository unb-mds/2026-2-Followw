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
    // sobra de largura vira margem igual dos dois lados
    centered: boolean;
    // cartões com texto menor e créditos abreviados
    compact: boolean;
}
export const DESKTOP: LayoutMetrics = {
    cardWidth: { min: 176, max: 208 },
    cardHeight: () => 112,
    margin: 0,
    minGap: 40,
    headings: true,
    centered: false,
    compact: true
};
export const MOBILE: LayoutMetrics = {
    cardWidth: { min: 220, max: 432 },
    cardHeight: (subject) => (subject.hours == null ? 120 : 104),
    margin: 24,
    minGap: 24,
    headings: false,
    centered: true,
    compact: false
};
const PAD = 24;
const HEADING_HEIGHT = 40;

function orderedColumns(model: CurriculumModel, periods: number[]) {
    const positions = new Map<string, number>();
    return periods.map((period) => {
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
    metrics: LayoutMetrics = DESKTOP,
    periods: number[] = model.periods
): FlowGeometry {
    const columns = orderedColumns(model, periods);
    const present = new Set(columns.flat().map((s) => s.code));
    const plan = planConnections(
        columns,
        model.edges.filter((e) => present.has(e.source) || present.has(e.target)),
        metrics.minGap
    );
    const gapWidths = [...plan.gapWidths];
    const gapTotal = gapWidths.reduce((a, b) => a + b, 0);
    const { min, max } = metrics.cardWidth;
    const cardWidth = Math.max(
        min,
        Math.min(max, (availableWidth - gapTotal - metrics.margin) / Math.max(1, periods.length))
    );
    const extra = availableWidth - gapTotal - cardWidth * periods.length;
    if (metrics.centered && extra > 0) {
        gapWidths[0] += extra / 2;
        gapWidths[gapWidths.length - 1] += extra / 2;
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
        edges: plan.route(nodes, gapStarts, rowTops, width),
        headings: metrics.headings
            ? periods.map((period, column) => ({ period, x: columnXs[column] + cardWidth / 2 }))
            : []
    };
}

export function pathData(points: Point[]) {
    return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
}
