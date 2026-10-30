import type { components } from '#/queries/schema.gen';

export const professorRef = (name: string): components['schemas']['ProfessorRef'] => ({
    siape: null,
    name,
    photo: null,
    email: null
});
