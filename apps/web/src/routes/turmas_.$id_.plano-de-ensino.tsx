import {
    allClassroomsQueryOptions,
    classroomTeachingPlanQueryOptions
} from '@followw/core/queries/classrooms.ts';
import { loadQuery } from '@followw/core/queries/load.ts';
import { createFileRoute, notFound, redirect } from '@tanstack/react-router';

import { ClassroomTeachingPlanPage } from '#/components/classroom/ClassroomTeachingPlanPage';
import { ErrorState } from '#/components/ErrorState';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/turmas_/$id_/plano-de-ensino')({
    loader: async ({ context: { queryClient }, params: { id } }) => {
        const user = await loadQuery(queryClient, meQueryOptions);
        if (!user) throw redirect({ to: '/login' });
        const classrooms = await loadQuery(queryClient, allClassroomsQueryOptions);
        const classroom = classrooms.find((item) => item.id === id);
        if (!classroom) throw notFound();
        const plan = await loadQuery(queryClient, classroomTeachingPlanQueryOptions(id));
        if (plan === null)
            throw redirect({ to: '/turmas/$id', params: { id }, search: { tab: 'posts' } });
        return { subjectName: classroom.subject.name };
    },
    head: ({ loaderData }) => ({
        meta: [{ title: `Plano de ensino · ${loaderData?.subjectName ?? 'Turma'} | Followw` }]
    }),
    errorComponent: ErrorState,
    component: TeachingPlanPage
});

function TeachingPlanPage() {
    const { id } = Route.useParams();
    const { subjectName } = Route.useLoaderData();
    return <ClassroomTeachingPlanPage id={id} subjectName={subjectName} />;
}
