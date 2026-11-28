import { flowTarget } from '@followw/core/lib/curriculum/target.ts';
import { titleCase } from '@followw/core/lib/profile.ts';
import { allClassroomsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { courseQueryOptions } from '@followw/core/queries/courses.ts';
import { curriculumQueryOptions } from '@followw/core/queries/curriculum.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { loadQuery } from '@followw/core/queries/load.ts';
import { noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound, rootRouteId } from '@tanstack/react-router';

import type { UserProfile } from '#/queries/me';

import { CourseSummary } from '#/components/curriculum/CourseSummary';
import { CurriculumView } from '#/components/curriculum/CurriculumView';
import { useDesktop } from '#/components/DesktopContext';
import { ErrorCard, ErrorState } from '#/components/ErrorState';
import { BackHeader } from '#/components/HeaderBar';
import { LoadingText } from '#/components/LoadingText';
import { useFlowSearch, validateFlowSearch } from '#/lib/curriculum/navigation';
import { useWidth } from '#/lib/width';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/_app/cursos/$id')({
    codeSplitGroupings: [['loader'], ['component'], ['errorComponent'], ['pendingComponent']],
    params: {
        parse: ({ id }) => {
            const courseId = /^\d+$/.test(id) ? Number(id) : 0;
            if (!Number.isSafeInteger(courseId) || courseId <= 0)
                throw notFound({ routeId: rootRouteId });
            return { id: courseId };
        },
        stringify: ({ id }) => ({ id: String(id) })
    },
    validateSearch: validateFlowSearch,
    staticData: { presentation: 'fullscreen' },
    loader: async ({ context: { queryClient }, params: { id: courseId } }) => {
        const user = await loadQuery(queryClient, meQueryOptions);
        const { ownCourse, loggedIn, entrySemester } = flowTarget(user, courseId);
        const [course] = await Promise.all([
            ownCourse
                ? user?.course
                : loadQuery(queryClient, courseQueryOptions(courseId)).catch(noop),
            entrySemester &&
                loadQuery(queryClient, curriculumQueryOptions(courseId, entrySemester)).catch(noop),
            loggedIn &&
                entrySemester &&
                loadQuery(queryClient, allClassroomsQueryOptions).catch(noop)
        ]);
        return { courseName: course?.name };
    },
    head: ({ loaderData }) => ({
        meta: [
            {
                title: loaderData?.courseName
                    ? `Fluxograma de ${titleCase(loaderData.courseName)} | Followw`
                    : 'Fluxograma | Followw'
            }
        ]
    }),
    pendingComponent: () => (
        <div className="flex flex-col gap-4 px-4 lg:px-6">
            <FlowHeader />
            <LoadingText>Carregando fluxo...</LoadingText>
        </div>
    ),
    errorComponent: (props) => (
        <div className="flex flex-col gap-4 px-4 lg:px-6">
            <FlowHeader />
            <ErrorState {...props} />
        </div>
    ),
    component: FlowPage
});

function FlowHeader() {
    return <BackHeader to="/buscar" title="Fluxo acadêmico" />;
}

function FlowContent({
    ownCourse,
    loggedIn,
    course,
    entrySemester,
    currentPeriod,
    completedSubjects,
    subject,
    desktop,
    isPending,
    isError,
    onRetry
}: {
    ownCourse: boolean;
    loggedIn: boolean;
    course: UserProfile['course'] | undefined;
    entrySemester?: string | null;
    currentPeriod: number | null;
    completedSubjects?: UserProfile['completed_subjects'];
    subject?: string | null;
    desktop: boolean | null;
    isPending: boolean;
    isError: boolean;
    onRetry: () => void;
}) {
    if (!ownCourse && isPending)
        return <LoadingText className="p-4">Carregando curso...</LoadingText>;
    if (!ownCourse && isError) {
        return (
            <div className="p-4">
                <ErrorCard message="Não foi possível carregar o curso." onRetry={onRetry} />
            </div>
        );
    }
    if (!course) return <p className="p-4">Curso não encontrado no catálogo.</p>;
    if (!entrySemester) {
        return (
            <p className="p-4">
                Semestre de referência indisponível. Não foi possível identificar a matriz deste
                curso.
            </p>
        );
    }
    return (
        <CurriculumView
            key={course.id}
            courseId={course.id}
            courseName={course.name}
            entrySemester={entrySemester}
            completedSubjects={completedSubjects}
            currentPeriod={currentPeriod}
            selected={subject ?? undefined}
            ownCourse={ownCourse}
            loggedIn={loggedIn}
            desktop={desktop}
        />
    );
}

function FlowPage() {
    const eligible = useDesktop();
    const { ref, width } = useWidth<HTMLDivElement>();
    const desktop = width ? eligible : null;
    const [{ subject }] = useFlowSearch();
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const { id: courseId } = Route.useParams();
    const { ownCourse, loggedIn, entrySemester, currentPeriod } = flowTarget(user, courseId);
    const listed = useQuery({ ...courseQueryOptions(courseId), enabled: !ownCourse });
    const unlisted = listed.error instanceof ApiError && listed.error.isNotFound;
    const course = ownCourse ? user?.course : listed.data;
    return (
        <div ref={ref} className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 px-4 pb-5 lg:px-6">
                <FlowHeader />
                {course && (
                    <CourseSummary
                        course={course}
                        entrySemester={entrySemester}
                        student={ownCourse ? undefined : (user ?? undefined)}
                    />
                )}
            </div>
            <FlowContent
                ownCourse={ownCourse}
                loggedIn={loggedIn}
                course={course}
                entrySemester={entrySemester}
                currentPeriod={currentPeriod}
                completedSubjects={user?.completed_subjects}
                subject={subject}
                desktop={desktop}
                isPending={listed.isPending}
                isError={listed.isLoadingError && !unlisted}
                onRetry={() => listed.refetch()}
            />
        </div>
    );
}
