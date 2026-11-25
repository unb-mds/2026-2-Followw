import type { Classroom } from '@followw/core/queries/classrooms.ts';
import type { FeedPost } from '@followw/core/queries/posts.ts';

import { semesterClassroomsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { latestPostsQueryOptions } from '@followw/core/queries/posts.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { SemesterSection } from '#/components/home/SemesterSection';
import { TodayDashboard } from '#/components/home/TodayDashboard';

import { renderWithRouter } from '../../helpers/router';

const today = '2026-11-23';
const classroom: Classroom = {
    id: '1',
    sigaa_id: 101,
    number: '1',
    semester: '2026.2',
    current: true,
    subject: { code: 'CIC0001', name: 'Disciplina' },
    professors: []
};

test('mostra o semestre e as três próximas datas logo abaixo do RU', () => {
    const html = renderWithRouter(
        <QueryClientProvider client={new QueryClient()}>
            <TodayDashboard
                user={null}
                now={{ date: today, weekday: 1, time: '08:00' }}
                day={{ date: '2026-11-24', weekday: 2 }}
                label="Terça-feira"
            />
        </QueryClientProvider>
    );

    expect(html.indexOf('aria-label="RU"')).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('aria-label="Semestre"')).toBeGreaterThan(html.indexOf('aria-label="RU"'));
    expect(html).toContain('<h3>2026.2</h3>');
    expect(html).toContain('aria-valuenow="83"');
    expect(html).toContain('Semana 16 de 19 · 21 dias até o fim das aulas');
    expect(Array.from(html.matchAll(/<time[^>]*>([^<]+)<\/time>/g), ([, date]) => date)).toEqual([
        '14/12',
        '18/12',
        '19/12'
    ]);
    expect(html).toContain('Data Limite para Consolidação de Turmas no SIGAA');
    expect(html).not.toContain('Turmas no semestre');
});

test('soma os horários da grade do semestre e desconsidera turmas trancadas', () => {
    const client = new QueryClient();
    client.setQueryData(semesterClassroomsQueryOptions('2026.2').queryKey, [
        { ...classroom, schedule: '35T23' },
        { ...classroom, id: '2', schedule: '2N1' },
        { ...classroom, id: '3', schedule: '27M12', status: 'trancado' }
    ] satisfies Classroom[]);

    const html = renderToStaticMarkup(
        <QueryClientProvider client={client}>
            <SemesterSection today={today} loggedIn />
        </QueryClientProvider>
    );

    expect(html).toMatch(/Turmas no semestre<\/dt><dd[^>]*>2<\/dd>/);
    expect(html).toMatch(/Carga horária semanal<\/dt><dd[^>]*>4h30<\/dd>/);
});

test('intercala avaliações das turmas matriculadas com o calendário e limita a três datas', () => {
    const client = new QueryClient();
    client.setQueryData(semesterClassroomsQueryOptions('2026.2').queryKey, [
        classroom,
        { ...classroom, id: '2', sigaa_id: 102, status: 'trancado' },
        { ...classroom, id: '3', sigaa_id: 103, status: 'pending_enrollment' }
    ] satisfies Classroom[]);
    const assessment: FeedPost['post'] = {
        id: 'assessment:1',
        type: 'assessment',
        classroom_sigaa_id: 101,
        starts_on: today,
        title: 'Prova final',
        attachments: [],
        is_read: false
    };
    const feed = (posts: Partial<FeedPost['post']>[]) => ({
        items: posts.map((post): FeedPost => ({ classroom, post: { ...assessment, ...post } })),
        updating: false
    });
    client.setQueryData(
        latestPostsQueryOptions.queryKey,
        feed([
            { starts_on: '2026-12-16', title: 'Entrega do projeto' },
            {},
            {},
            { starts_on: '2026-11-22', title: 'Prova passada' },
            { classroom_sigaa_id: 102, title: 'Prova da turma trancada' },
            { classroom_sigaa_id: 103, title: 'Prova da matrícula pendente' },
            { classroom_sigaa_id: null, title: 'Atividade sem turma' },
            { type: 'news', title: 'Notícia da turma' },
            { starts_on: null, title: 'Prova sem data' }
        ])
    );

    const html = renderWithRouter(
        <QueryClientProvider client={client}>
            <SemesterSection today={today} loggedIn />
        </QueryClientProvider>
    );

    expect(Array.from(html.matchAll(/<time[^>]*>([^<]+)<\/time>/g), ([, date]) => date)).toEqual([
        '23/11',
        '14/12',
        '16/12'
    ]);
    expect(html).toContain('href="/turmas/1?tab=posts"');
    expect(html).toContain('Prova final · CIC0001');
    expect(html).toContain('Entrega do projeto · CIC0001');
    expect(html).toContain('Término do Período de Aulas');
});

test('mantém o semestre e as próximas datas depois que as aulas terminam', () => {
    const html = renderToStaticMarkup(<SemesterSection today="2026-12-15" loggedIn={false} />);

    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('Período de aulas encerrado');
    expect(html).toContain('Término do Período Letivo');
    expect(html).not.toContain('Término do Período de Aulas');
});
