import { describe, expect, test } from 'bun:test';

import type { PublicCourse } from '#/queries/courses';

import { filterCourses } from '#/queries/courses';

const courses: PublicCourse[] = [
    {
        id: 1,
        sigaa_id: 100,
        name: 'CIÊNCIA DA COMPUTAÇÃO',
        shift: 'DIURNO',
        unit: { id: 1, code: 'CIC', name: 'COMPUTAÇÃO' },
        level: 'Graduação'
    },
    {
        id: 2,
        sigaa_id: 101,
        name: 'CIÊNCIA DA COMPUTAÇÃO',
        shift: 'NOTURNO',
        unit: { id: 1, code: 'CIC', name: 'COMPUTAÇÃO' },
        level: 'Graduação'
    },
    {
        id: 3,
        sigaa_id: null,
        name: 'FÍSICA',
        shift: null,
        unit: { id: 2, code: null, name: 'FÍSICA' },
        level: null
    }
];

describe('busca de cursos', () => {
    test('encontra o nome sem acentos, com espaços e palavras em qualquer ordem', () => {
        expect(filterCourses(courses, '  COMPUTACAO   ciencia ')).toEqual(courses.slice(0, 2));
    });
    test('preserva os cursos de turnos diferentes e os sem id do SIGAA', () => {
        expect(filterCourses(courses, 'ciencia')).toHaveLength(2);
        expect(filterCourses(courses, 'fisica')).toEqual([courses[2]]);
    });
    test('não lista cursos sem texto nem quando o nome não corresponde', () => {
        expect(filterCourses(courses, '  ')).toEqual([]);
        expect(filterCourses(courses, 'direito')).toEqual([]);
    });
});
