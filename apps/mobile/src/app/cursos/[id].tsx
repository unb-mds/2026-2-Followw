import { flowTarget } from '@followw/core/lib/curriculum/target.ts';
import { titleCase } from '@followw/core/lib/profile.ts';
import { courseQueryOptions } from '@followw/core/queries/courses.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { CourseSummary } from '@/components/curriculum/CourseSummary';
import { CurriculumView } from '@/components/curriculum/CurriculumView';
import { ErrorCard } from '@/components/ErrorState';
import { BackHeader } from '@/components/HeaderBar';
import { LoadingText } from '@/components/LoadingText';
import { NotFoundPage } from '@/components/NotFoundPage';
import { Screen } from '@/components/Screen';
import { ShareButton } from '@/components/ShareButton';
import { Text } from '@/components/ui/text';

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

    if (!valid) return <NotFoundPage />;

    const header = (
        <>
            <BackHeader
                to="/buscar"
                title="Fluxo acadêmico"
                actions={
                    <ShareButton
                        title={course ? `Fluxograma de ${titleCase(course.name)}` : 'Fluxograma'}
                        path={`/cursos/${courseId}`}
                    />
                }
            />
            {course && (
                <View className="pb-5">
                    <CourseSummary course={course} entrySemester={entrySemester} />
                </View>
            )}
        </>
    );

    let content: React.ReactNode = null;
    if (me.isPending || (!ownCourse && listed.isPending))
        content = <LoadingText className="p-4">Carregando curso...</LoadingText>;
    else if (!ownCourse && listed.isLoadingError && !unlisted)
        content = (
            <View className="p-4">
                <ErrorCard
                    message="Não foi possível carregar o curso."
                    onRetry={() => void listed.refetch()}
                />
            </View>
        );
    else if (!course) content = <Text className="p-4">Curso não encontrado no catálogo.</Text>;
    else if (!entrySemester)
        content = (
            <Text className="p-4">
                Semestre de referência indisponível. Não foi possível identificar a matriz deste
                curso.
            </Text>
        );

    if (content || !course || !entrySemester)
        return (
            <Screen fullscreen header={header}>
                {content}
            </Screen>
        );
    return (
        <CurriculumView
            key={course.id}
            courseId={course.id}
            entrySemester={entrySemester}
            currentPeriod={currentPeriod}
            selected={selected}
            ownCourse={ownCourse}
            loggedIn={loggedIn}
            header={header}
        />
    );
}
