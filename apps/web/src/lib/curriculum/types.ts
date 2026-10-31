import type { CurriculumSubject } from '#/queries/curriculum';

export type AcademicState = 'completed' | 'enrolled' | 'overdue' | 'pending' | 'unknown';
export type FlowSubject = CurriculumSubject & { name: string; period: number };
export interface FlowEdge {
    id: string;
    kind: 'prerequisite' | 'corequisite';
    source: string;
    target: string;
    group: number;
    alternative: boolean;
}
export interface CurriculumModel {
    periods: number[];
    subjects: FlowSubject[];
    byCode: Map<string, FlowSubject>;
    edges: FlowEdge[];
    // matérias que têm a chave como pré-requisito
    unlocks: Map<string, FlowSubject[]>;
}

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
}
export interface FlowGeometry {
    width: number;
    height: number;
    nodes: FlowNode[];
    edges: RoutedEdge[];
    // centro horizontal de cada semestre
    columns: { period: number; x: number }[];
}
