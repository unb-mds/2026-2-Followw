import { ApiError } from '@followw/core/queries/errors.ts';
import { questionnaireQueryOptions } from '@followw/core/queries/institutional-evaluations.ts';
import { loadQuery } from '@followw/core/queries/load.ts';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Link, createFileRoute, notFound, redirect, rootRouteId } from '@tanstack/react-router';

import { LoginRedirect } from '#/components/auth/LoginRedirect';
import { ErrorCard, ErrorState } from '#/components/ErrorState';
import { BackHeader } from '#/components/HeaderBar';
import { EvaluationForm } from '#/components/institutional-evaluation/EvaluationForm';
import { CardSkeleton, LoadingSkeleton } from '#/components/LoadingSkeleton';
import { buttonVariants } from '#/components/ui/button';
import { Card } from '#/components/ui/card';
import { requireUser } from '#/lib/require-user';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/_app/avaliacao-institucional_/$id')({
    ssr: false,
    params: {
        parse: ({ id }) => {
            const evaluationId = /^\d+$/.test(id) ? Number(id) : 0;
            if (!Number.isSafeInteger(evaluationId) || evaluationId <= 0)
                throw notFound({ routeId: rootRouteId });
            return { id: evaluationId };
        },
        stringify: ({ id }) => ({ id: String(id) })
    },
    loader: async ({ context: { queryClient }, location, params: { id } }) => {
        await requireUser(queryClient, location.href);
        await loadQuery(queryClient, questionnaireQueryOptions(id)).catch((error: unknown) => {
            if (error instanceof ApiError && error.isUnauthorized)
                throw redirect({ to: '/login', search: { returnTo: location.href } });
        });
    },
    head: () => ({ meta: [{ title: 'Questionário da avaliação | Followw' }] }),
    staticData: { header: QuestionnaireHeader },
    pendingComponent: QuestionnaireLoading,
    errorComponent: ErrorState,
    component: QuestionnairePage
});

function QuestionnaireHeader() {
    return <BackHeader to="/" title="Avaliação institucional" />;
}

function QuestionnaireLoading() {
    return (
        <LoadingSkeleton label="Carregando questionário..." className="mx-auto max-w-3xl">
            <CardSkeleton />
            <CardSkeleton />
        </LoadingSkeleton>
    );
}

function QuestionnairePage() {
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const { id } = Route.useParams();
    const questionnaire = useQuery({ ...questionnaireQueryOptions(id), enabled: Boolean(user) });

    if (!user) return <LoginRedirect />;
    if (questionnaire.isPending) return <QuestionnaireLoading />;
    if (questionnaire.error instanceof ApiError && questionnaire.error.isNotFound) {
        return (
            <Card className="mx-auto max-w-3xl items-start gap-3 p-5">
                <p className="text-sm">Esta avaliação já não está disponível para preenchimento.</p>
                <Link
                    to="/avaliacao-institucional"
                    search={{ view: 'list' }}
                    className={buttonVariants({ variant: 'outline' })}
                >
                    Voltar às avaliações
                </Link>
            </Card>
        );
    }
    if (!questionnaire.data) {
        return (
            <ErrorCard
                className="mx-auto max-w-3xl"
                message="Não foi possível carregar o questionário."
                onRetry={() => void questionnaire.refetch()}
            />
        );
    }
    return (
        <EvaluationForm
            key={id}
            questionnaire={questionnaire.data}
            onCheck={async () => (await questionnaire.refetch()).isSuccess}
        />
    );
}
