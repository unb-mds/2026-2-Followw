import { createStandardSchemaV1, parseAsStringLiteral } from 'nuqs/server';

export const classroomSearchParsers = {
    tab: parseAsStringLiteral(['frequency', 'posts', 'members']).withDefault('frequency')
};

export const validateClassroomSearch = createStandardSchemaV1(classroomSearchParsers, {
    partialOutput: true
});
