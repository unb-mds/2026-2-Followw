import { noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound, rootRouteId } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { getCurrentSemester } from '#/calendar';
import { CourseInfo } from '#/components/curriculum/CourseInfo';
import { CurriculumView } from '#/components/curriculum/CurriculumView';
import { FlowClose } from '#/components/curriculum/FlowClose';
import { Legend } from '#/components/curriculum/Legend';
import { ErrorCard, ErrorState } from '#/components/ErrorState';
import { LoadingText } from '#/components/LoadingText';
import { validateFlowSearch } from '#/lib/curriculum/navigation';
import { allClassroomsQueryOptions } from '#/queries/classrooms';
import { coursesQueryOptions } from '#/queries/courses';
import { curriculumQueryOptions } from '#/queries/curriculum';
import { loadQuery } from '#/queries/load';
import { meQueryOptions } from '#/queries/me';
import { currentCurriculumPeriod } from '#/queries/subjects';

export const Route = createFileRoute('/_app/cursos/$id')({
    head: () => ({ meta: [{ title: 'Fluxo acadêmico | Followw' }] }),
    validateSearch: validateFlowSearch,
    staticData: { presentation: 'fullscreen' },
    params: {
        parse: ({ id }) => {
            const courseId = /^\d+$/.test(id) ? Number(id) : 0;
            if (!Number.isSafeInteger(courseId) || courseId <= 0)
                throw notFound({ routeId: rootRouteId });
            return { id: courseId };
        },
        stringify: ({ id }) => ({ id: String(id) })
    },
    loader: async ({ context: { queryClient }, params: { id: courseId } }) => {
        const user = await loadQuery(queryClient, meQueryOptions);
        const ownCourse = courseId === user?.course?.id;
        const entrySemester = ownCourse ? user?.entry_semester : getCurrentSemester()?.semester;
        await Promise.all([
            !ownCourse && loadQuery(queryClient, coursesQueryOptions).catch(noop),
            entrySemester &&
                loadQuery(queryClient, curriculumQueryOptions(courseId, entrySemester)).catch(noop),
            ownCourse &&
                entrySemester &&
                loadQuery(queryClient, allClassroomsQueryOptions).catch(noop)
        ]);
    },
    pendingComponent: () => (
        <div className="flex flex-col gap-4 p-6">
            <FlowClose />
            <LoadingText>Carregando fluxo...</LoadingText>
        </div>
    ),
    errorComponent: (props) => (
        <div className="flex flex-col gap-4 p-6">
            <FlowClose />
            <ErrorState {...props} />
        </div>
    ),
    component: FlowPage
});

function FlowPage() {
    const ref = useRef<HTMLDivElement>(null);
    const [desktop, setDesktop] = useState<boolean | null>(null);
    useEffect(() => {
        const observer = new ResizeObserver((entries) =>
            setDesktop(entries[0].contentRect.width >= 1024)
        );
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);
    const search = Route.useSearch();
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const { id: courseId } = Route.useParams();
    const ownCourse = courseId === user?.course?.id;
    const courses = useQuery({
        ...coursesQueryOptions,
        enabled: !ownCourse
    });
    const course = ownCourse ? user?.course : courses.data?.find((item) => item.id === courseId);
    const entrySemester = ownCourse ? user?.entry_semester : getCurrentSemester()?.semester;
    const currentPeriod = ownCourse
        ? currentCurriculumPeriod(user?.entry_semester, getCurrentSemester()?.semester)
        : null;
    return (
        <div ref={ref} className="flex min-h-0 flex-1 flex-col">
            <header className="relative flex shrink-0 items-center justify-between gap-4 border-b px-4 py-5 lg:px-6">
                <div className="flex min-w-0 flex-col gap-1 lg:max-w-60 xl:max-w-80">
                    <h1 className="text-2xl font-bold">Fluxo acadêmico</h1>
                    {course && <CourseInfo course={course} entrySemester={entrySemester} />}
                </div>
                {desktop && ownCourse && course && entrySemester && <Legend />}
                <FlowClose />
            </header>
            {!ownCourse && courses.isPending ? (
                <LoadingText className="p-4">Carregando curso...</LoadingText>
            ) : !ownCourse && courses.isLoadingError ? (
                <div className="p-4">
                    <ErrorCard
                        message="Não foi possível carregar o curso."
                        onRetry={() => courses.refetch()}
                    />
                </div>
            ) : !course ? (
                <p className="p-4">Curso não encontrado no catálogo.</p>
            ) : !entrySemester ? (
                <p className="p-4">
                    Semestre de referência indisponível. Não foi possível identificar a matriz deste
                    curso.
                </p>
            ) : (
                <CurriculumView
                    key={course.id}
                    courseId={course.id}
                    entrySemester={entrySemester}
                    currentPeriod={currentPeriod}
                    selected={search.materia}
                    studentContext={ownCourse}
                    desktop={desktop}
                />
            )}
        </div>
    );
}
