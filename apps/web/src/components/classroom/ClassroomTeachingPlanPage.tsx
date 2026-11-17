import { classroomTeachingPlanQueryOptions } from '@followw/core/queries/classrooms.ts';
import { noop, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate } from '@tanstack/react-router';
import { ArrowLeft, RefreshCw } from 'lucide-react';

import { ClassroomTeachingPlan } from '#/components/classroom/ClassroomTeachingPlan';
import { ErrorCard, StaleDataNotice } from '#/components/ErrorState';
import { FollowwLogo } from '#/components/FollowwLogo';
import { LoadingText } from '#/components/LoadingText';
import { Button } from '#/components/ui/button';
import { cn } from '#/lib/shadcn';
import { refreshQuery } from '#/queries/refresh';

export function ClassroomTeachingPlanPage({
    id,
    subjectName
}: {
    id: string;
    subjectName: string;
}) {
    const client = useQueryClient();
    const options = classroomTeachingPlanQueryOptions(id);
    const plan = useQuery(options);
    const refresh = () => void refreshQuery(client, options).catch(noop);

    if (plan.data === null)
        return <Navigate to="/turmas/$id" params={{ id }} search={{ tab: 'posts' }} replace />;

    return (
        <main className="min-h-dvh bg-background px-6 py-10 text-foreground">
            <div className="mx-auto flex max-w-2xl flex-col gap-10">
                <header className="flex flex-col gap-6">
                    <Link
                        to="/turmas/$id"
                        params={{ id }}
                        search={{ tab: 'posts' }}
                        className="flex w-fit items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
                    >
                        <ArrowLeft className="size-4" aria-hidden />
                        Voltar à turma
                    </Link>
                    <div className="flex items-center gap-3">
                        <FollowwLogo className="size-10 shrink-0" />
                        <h1 className="flex-1 text-2xl font-bold tracking-tight">
                            Plano de ensino
                        </h1>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Atualizar plano de ensino"
                            disabled={plan.isFetching}
                            onClick={refresh}
                        >
                            <RefreshCw
                                aria-hidden
                                className={cn('size-4', plan.isFetching && 'animate-spin')}
                            />
                        </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">{subjectName}</p>
                </header>
                {plan.isPending ? (
                    <output className="text-sm text-muted-foreground">
                        <LoadingText>Consultando plano de ensino...</LoadingText>
                    </output>
                ) : plan.isLoadingError ? (
                    <ErrorCard
                        message="Não foi possível consultar o plano de ensino."
                        onRetry={refresh}
                    />
                ) : (
                    <div className="flex flex-col gap-3">
                        {plan.isError && <StaleDataNotice subject="o plano de ensino" />}
                        <ClassroomTeachingPlan plan={plan.data} />
                    </div>
                )}
            </div>
        </main>
    );
}
