import type { CurriculumModel, FlowEdge, FlowSubject } from '#/lib/curriculum/model';

import { groupCorequisites } from '#/lib/curriculum/corequisites';
import { planConnections } from '#/lib/curriculum/routing';

export interface Point {
    x: number;
    y: number;
}
export interface FlowNode {
    subject: FlowSubject;
    x: number;
    y: number;
    width: number;
    height: number;
    row: number;
    column: number;
}
export interface RoutedEdge {
    edge: FlowEdge;
    points: Point[];
    label: string;
}
export interface FlowGeometry {
    width: number;
    height: number;
    nodes: FlowNode[];
    edges: RoutedEdge[];
    headings: { period: number; x: number }[];
}
const PAD = 24;
export const DESKTOP_CARD_HEIGHT = 112;
export const DESKTOP_CARD_MAX_WIDTH = 208;

function orderedColumns(model: CurriculumModel, periods: number[]) {
    const positions = new Map<string, number>();
    return periods.map((period) => {
        let subjects = model.subjects.filter((s) => s.period === period);
        const score = (subject: FlowSubject) => {
            const rows = model.edges
                .filter((e) => e.kind === 'prerequisite' && e.target === subject.code)
                .flatMap((e) => {
                    const row = positions.get(e.source);
                    return row === undefined ? [] : [row];
                });
            return rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : Infinity;
        };
        subjects.sort((a, b) => score(a) - score(b) || a.code.localeCompare(b.code));
        subjects = groupCorequisites(subjects, model.edges);
        subjects.forEach((subject, row) => positions.set(subject.code, row));
        return subjects;
    });
}

export function layoutCurriculum(
    model: CurriculumModel,
    availableWidth: number,
    mobilePeriod?: number
): FlowGeometry {
    const mobile = mobilePeriod !== undefined;
    const periods = mobile ? [mobilePeriod] : model.periods;
    const columns = orderedColumns(model, periods);
    const present = new Set(columns.flat().map((s) => s.code));
    const visibleEdges = model.edges.filter((e) =>
        mobile ? present.has(e.source) || present.has(e.target) : true
    );
    const plan = planConnections(columns, visibleEdges, mobile);
    const gapWidths = [...plan.gapWidths];
    const gapTotal = gapWidths.reduce((a, b) => a + b, 0);
    const cardWidth = mobile
        ? Math.max(220, Math.min(432, availableWidth - gapTotal - 24))
        : Math.max(
              176,
              Math.min(
                  DESKTOP_CARD_MAX_WIDTH,
                  (availableWidth - gapTotal) / Math.max(1, periods.length)
              )
          );
    if (mobile && availableWidth > cardWidth + gapTotal) {
        const extra = (availableWidth - cardWidth - gapTotal) / 2;
        gapWidths[0] += extra;
        gapWidths[gapWidths.length - 1] += extra;
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
    const heights = columns.map((column) =>
        column.map((subject) =>
            mobile ? (subject.hours == null ? 120 : 104) : DESKTOP_CARD_HEIGHT
        )
    );
    const rowHeights = plan.gutterHeights.map((_, row) =>
        Math.max(0, ...heights.map((column) => column[row] ?? 0))
    );
    const rowTops: number[] = [];
    let y = mobile ? 0 : 40;
    for (let row = 0; row < rowHeights.length; row++) {
        y += plan.gutterHeights[row];
        rowTops.push(y);
        y += rowHeights[row];
    }
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
    const edges = plan.route(nodes, gapStarts, rowTops, width).map(({ edge, points }) => {
        const origin = model.byCode.get(edge.source)!;
        const destination = model.byCode.get(edge.target)!;
        return {
            edge,
            points,
            label: `${edge.source} (${origin.period}º semestre) ${edge.kind === 'corequisite' ? '↔' : '→'} ${edge.target} (${destination.period}º semestre)${edge.kind === 'corequisite' ? ': correquisito (cursar em conjunto)' : ': pré-requisito'}${edge.alternative ? `; alternativa ${edge.group}; E dentro do grupo, OU entre grupos` : ''}`
        };
    });
    return {
        width,
        height: y + PAD,
        nodes,
        edges,
        headings: periods.map((period, column) => ({
            period,
            x: columnXs[column] + cardWidth / 2
        }))
    };
}

export function pathData(points: Point[]) {
    return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
}
