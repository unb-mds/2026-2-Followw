import { describe, expect, test } from 'bun:test';

import type { ClassroomPost } from '#/queries/classrooms';

import { postDateLabel, postLink, postTypeLabels } from '#/lib/classroom-posts';

const post: ClassroomPost = { id: 'topic:abc', type: 'topic', title: 'Aula', attachments: [] };

describe('postagens da turma', () => {
    test('datas ausentes não ganham data de publicação fictícia', () => {
        expect(postDateLabel(post)).toBeNull();
        expect(postDateLabel({ ...post, type: 'material' })).toBeNull();
    });

    test('tópicos mostram o período sem deslocamento de fuso nem dia repetido', () => {
        expect(postDateLabel({ ...post, starts_on: '2026-10-15', ends_on: '2026-10-20' })).toBe(
            '15/10/2026 a 20/10/2026'
        );
        expect(postDateLabel({ ...post, starts_on: '2026-10-15', ends_on: '2026-10-15' })).toBe(
            '15/10/2026'
        );
    });

    test('avaliações preservam hora precisa e textos como Hora da aula', () => {
        expect(
            postDateLabel({ ...post, type: 'assessment', starts_at: '2026-10-29T16:00:00' })
        ).toBe('29/10/2026 16:00');
        expect(
            postDateLabel({
                ...post,
                type: 'assessment',
                starts_on: '2026-10-29',
                time_label: 'Hora da aula'
            })
        ).toBe('29/10/2026 · Hora da aula');
    });

    test('notícias exibem data e hora disponíveis', () => {
        expect(postDateLabel({ ...post, type: 'news', published_on: '2026-10-15' })).toBe(
            '15/10/2026'
        );
        expect(postDateLabel({ ...post, type: 'news', published_at: '2026-10-15T10:30:00' })).toBe(
            '15/10/2026 10:30'
        );
        expect(postTypeLabels).toEqual({
            news: 'Notícia',
            topic: 'Tópico de aula',
            material: 'Material',
            assessment: 'Avaliação'
        });
    });

    test('links só apontam para endereços HTTP válidos', () => {
        expect(postLink('https://sigaa.unb.br/material.pdf')).toBe(
            'https://sigaa.unb.br/material.pdf'
        );
        for (const url of [null, undefined, '', '#', 'javascript:alert(1)', 'data:text/html,teste'])
            expect(postLink(url)).toBeNull();
    });
});
