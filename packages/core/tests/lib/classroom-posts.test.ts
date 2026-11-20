import { describe, expect, test } from 'bun:test';

import type { ClassroomPost } from '../../src/queries/classrooms.ts';

import {
    groupTopics,
    postDateLabel,
    postLink,
    postTypeLabels
} from '../../src/lib/classroom-posts.ts';

const post: ClassroomPost = {
    id: 'topic:abc',
    type: 'topic',
    title: 'Aula',
    attachments: [],
    is_read: false
};

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

    test('agrupa materiais pelo tópico, na ordem da lista', () => {
        const material = (id: string, topic_id?: string): ClassroomPost => ({
            ...post,
            id,
            type: 'material',
            topic_id
        });
        const outro = { ...post, id: 'topic:outro' };
        const posts = [
            material('m1', post.id),
            post,
            outro,
            material('m2'),
            material('m3', post.id)
        ];
        const { topics, materials } = groupTopics(posts);
        expect([...topics.keys()]).toEqual([post.id, outro.id]);
        expect(materials.get(post.id)?.map((item) => item.id)).toEqual(['m1', 'm3']);
        expect(materials.has(outro.id)).toBe(false);
    });
});
