import type { components } from '@followw/core/queries/schema.gen.ts';

export const professorRef = (name: string): components['schemas']['ProfessorRef'] => ({
    siape: null,
    name,
    photo: null,
    email: null
});
