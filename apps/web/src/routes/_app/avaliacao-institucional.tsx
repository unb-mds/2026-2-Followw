import { formatClassroomDate } from '@followw/core/lib/classroom-details.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { evaluationsQueryOptions } from '@followw/core/queries/institutional-evaluations.ts';
import { loadQuery } from '@followw/core/queries/load.ts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, createFileRoute, redirect } from '@tanstack/react-router';
import { ChevronRight, ClipboardList } from 'lucide-react';

import { LoginRedirect } from '#/components/auth/LoginRedirect';
import { ErrorState } from '#/components/ErrorState';
import { BackHeader } from '#/components/HeaderBar';
import { CardSkeleton, LoadingSkeleton } from '#/components/LoadingSkeleton';
import { Card } from '#/components/ui/card';
import { requireUser } from '#/lib/require-user';
import { meQueryOptions } from '#/queries/me';

export const Route = createFileRoute('/_app/avaliacao-institucional')({
    ssr: false,
    validateSearch: (search): { view?: 'list' } => (search.view === 'list' ? { view: 'list' } : {}),
    loaderDeps: ({ search }) => ({ view: search.view }),
    loader: async ({ context: { queryClient }, location, deps: { view } }) => {
        await requireUser(queryClient, location.href);
        const evaluations = await loadQuery(queryClient, evaluationsQueryOptions).catch(
            (error: unknown) => {
                if (error instanceof ApiError && error.isUnauthorized)
                    throw redirect({ to: '/login', search: { returnTo: location.href } });
                throw error;
            }
        );
        if (view !== 'list' && evaluations.length === 1) {
            throw redirect({
                to: '/avaliacao-institucional/$id',
                params: { id: evaluations[0].sigaa_id },
                replace: true
            });
        }
    },
    head: () => ({ meta: [{ title: 'Avaliação institucional | Followw' }] }),
    staticData: { header: EvaluationHeader },
    pendingComponent: () => (
        <LoadingSkeleton label="Carregando avaliações...">
            <CardSkeleton media="size-10 rounded-lg" />
        </LoadingSkeleton>
    ),
    errorComponent: ErrorState,
    component: EvaluationsPage
});

function EvaluationHeader() {
    return <BackHeader to="/" title="Avaliação institucional" />;
}

function EvaluationsPage() {
    const { data: user } = useSuspenseQuery(meQueryOptions);
    if (!user) return <LoginRedirect />;
    return <EvaluationList />;
}

function EvaluationList() {
    const { data: evaluations } = useSuspenseQuery(evaluationsQueryOptions);
    return (
        <section
            aria-label="Avaliações disponíveis"
            className="mx-auto flex max-w-3xl flex-col gap-3"
        >
            {evaluations.length === 0 && (
                <Card className="p-5 text-sm text-muted-foreground">
                    Nenhuma avaliação disponível no SIGAA no momento.
                </Card>
            )}
            {evaluations.map((evaluation) => (
                <Link
                    key={evaluation.sigaa_id}
                    to="/avaliacao-institucional/$id"
                    params={{ id: evaluation.sigaa_id }}
                    preload={false}
                    className="flex items-center gap-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 hover:bg-muted"
                >
                    <ClipboardList className="size-5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="font-medium">{evaluation.title}</span>
                        <span className="text-sm text-muted-foreground">
                            {evaluation.semester} · Até{' '}
                            {formatClassroomDate(evaluation.response_ends_on)}
                        </span>
                    </span>
                    <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                    />
                </Link>
            ))}
        </section>
    );
}
