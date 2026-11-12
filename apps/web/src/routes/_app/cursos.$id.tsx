import { noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound, rootRouteId } from '@tanstack/react-router';

import type { UserProfile } from '#/queries/me';

import { getCurrentSemester } from '#/calendar';
import { CourseSummary } from '#/components/curriculum/CourseSummary';
import { CurriculumView } from '#/components/curriculum/CurriculumView';
import { Legend } from '#/components/curriculum/Legend';
import { useDesktop } from '#/components/DesktopContext';
import { ErrorCard, ErrorState } from '#/components/ErrorState';
import { BackHeader } from '#/components/HeaderBar';
import { LoadingText } from '#/components/LoadingText';
import { useFlowSearch, validateFlowSearch } from '#/lib/curriculum/navigation';
import { titleCase } from '#/lib/profile';
import { useWidth } from '#/lib/width';
import { allClassroomsQueryOptions } from '#/queries/classrooms';
import { courseQueryOptions } from '#/queries/courses';
import { curriculumQueryOptions } from '#/queries/curriculum';
import { ApiError } from '#/queries/errors';
import { loadQuery } from '#/queries/load';
import { meQueryOptions } from '#/queries/me';
import { currentCurriculumPeriod } from '#/queries/subjects';

/** O curso do aluno usa o ingresso dele; outro curso, a matriz vigente no semestre atual. */
function flowTarget(user: UserProfile | null | undefined, courseId: number) {
    const semester = getCurrentSemester()?.semester;
    const ownCourse = courseId === user?.course?.id;
    return {
        ownCourse,
        loggedIn: Boolean(user),
        entrySemester: ownCourse ? user?.entry_semester : semester,
        currentPeriod: ownCourse ? currentCurriculumPeriod(user?.entry_semester, semester) : null
    };
}

export const Route = createFileRoute('/_app/cursos/$id')({
    codeSplitGroupings: [['loader'], ['component'], ['errorComponent'], ['pendingComponent']],
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

function FlowHeader({ legend = false }: { legend?: boolean }) {
    return <BackHeader to="/buscar" title="Fluxo acadêmico" actions={legend && <Legend />} />;
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
                <FlowHeader legend={Boolean(desktop && loggedIn && course && entrySemester)} />
                {course && <CourseSummary course={course} entrySemester={entrySemester} />}
            </div>
            {!ownCourse && listed.isPending ? (
                <LoadingText className="p-4">Carregando curso...</LoadingText>
            ) : !ownCourse && listed.isLoadingError && !unlisted ? (
                <div className="p-4">
                    <ErrorCard
                        message="Não foi possível carregar o curso."
                        onRetry={() => listed.refetch()}
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
                    selected={subject ?? undefined}
                    ownCourse={ownCourse}
                    loggedIn={loggedIn}
                    desktop={desktop}
                />
            )}
        </div>
    );
}
