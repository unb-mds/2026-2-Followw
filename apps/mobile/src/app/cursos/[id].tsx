import { flowTarget } from '@followw/core/lib/curriculum/target.ts';
import { titleCase } from '@followw/core/lib/profile.ts';
import { courseQueryOptions } from '@followw/core/queries/courses.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SearchX } from 'lucide-react-native';

import { CourseSummary } from '@/components/curriculum/CourseSummary';
import { CurriculumView } from '@/components/curriculum/CurriculumView';
import { Legend } from '@/components/curriculum/Legend';
import { ErrorCard } from '@/components/ErrorState';
import { LoadingText } from '@/components/LoadingText';
import { OfflineBanner } from '@/components/OfflineBanner';
import { PageState } from '@/components/PageState';
import { Screen } from '@/components/Screen';
import { ShareButton } from '@/components/ShareButton';

export { ErrorState as ErrorBoundary } from '@/components/ErrorState';

const SUBJECT_CODE = /^[a-zA-Z0-9_-]{1,32}$/;

export default function CourseFlowScreen() {
    const params = useLocalSearchParams<{ id: string; subject?: string }>();
    const courseId = /^\d+$/.test(params.id) ? Number(params.id) : 0;
    const valid = Number.isSafeInteger(courseId) && courseId > 0;
    const selected =
        params.subject && SUBJECT_CODE.test(params.subject) ? params.subject : undefined;
    const me = useQuery(meQueryOptions);
    const user = me.data;
    const { ownCourse, loggedIn, entrySemester, currentPeriod } = flowTarget(user, courseId);
    const listed = useQuery({ ...courseQueryOptions(courseId), enabled: valid && !ownCourse });
    const unlisted = listed.error instanceof ApiError && listed.error.isNotFound;
    const course = ownCourse ? user?.course : listed.data;

    const options = (
        <Stack.Screen
            options={{
                title: 'Fluxo acadêmico',
                headerRight: valid
                    ? // oxlint-disable-next-line react/no-unstable-nested-components -- headerRight exige função
                      () => (
                          <ShareButton
                              title={
                                  course ? `Fluxograma de ${titleCase(course.name)}` : 'Fluxograma'
                              }
                              path={`/cursos/${courseId}`}
                          />
                      )
                    : undefined
            }}
        />
    );

    if (
        !valid ||
        (!ownCourse && !listed.isPending && !listed.isLoadingError && !course) ||
        unlisted
    )
        return (
            <Screen>
                {options}
                <PageState
                    icon={SearchX}
                    title="Curso não encontrado"
                    message="Esse curso não está no catálogo."
                />
            </Screen>
        );
    if (me.isPending || (!ownCourse && listed.isPending))
        return (
            <Screen>
                {options}
                <LoadingText>Carregando curso...</LoadingText>
            </Screen>
        );
    if (!course)
        return (
            <Screen>
                {options}
                <ErrorCard
                    message="Não foi possível carregar o curso."
                    onRetry={() => void listed.refetch()}
                />
            </Screen>
        );
    if (!entrySemester)
        return (
            <Screen>
                {options}
                <CourseSummary course={course} entrySemester={entrySemester} />
                <PageState
                    title="Semestre de referência indisponível"
                    message="Não foi possível identificar a matriz deste curso."
                />
            </Screen>
        );
    return (
        <>
            {options}
            <OfflineBanner />
            <CurriculumView
                key={course.id}
                courseId={course.id}
                entrySemester={entrySemester}
                currentPeriod={currentPeriod}
                selected={selected}
                ownCourse={ownCourse}
                loggedIn={loggedIn}
                header={
                    <>
                        <CourseSummary course={course} entrySemester={entrySemester} />
                        {loggedIn && <Legend />}
                    </>
                }
            />
        </>
    );
}
