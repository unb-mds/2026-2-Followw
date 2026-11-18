import type { TeachingPlan } from '@followw/core/queries/classrooms.ts';

import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

import { ClassroomTeachingPlan } from '#/components/classroom/ClassroomTeachingPlan';
import { FollowwLogo } from '#/components/FollowwLogo';

export function ClassroomTeachingPlanPage({
    id,
    subjectName,
    plan
}: {
    id: string;
    subjectName: string;
    plan: TeachingPlan;
}) {
    return (
        <main className="min-h-dvh bg-background px-6 py-10 text-foreground">
            <div className="mx-auto flex max-w-2xl flex-col gap-10">
                <header className="flex flex-col gap-6">
                    <Link
                        to="/turmas/$id"
                        params={{ id }}
                        className="flex w-fit items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
                    >
                        <ArrowLeft className="size-4" aria-hidden />
                        Voltar à turma
                    </Link>
                    <div className="flex items-center gap-3">
                        <FollowwLogo className="size-10 shrink-0" />
                        <h1 className="text-2xl font-bold tracking-tight">Plano de ensino</h1>
                    </div>
                    <p className="text-sm text-muted-foreground">{subjectName}</p>
                </header>
                <ClassroomTeachingPlan plan={plan} />
            </div>
        </main>
    );
}
