import type { Classroom, TeachingPlan } from '@followw/core/queries/classrooms.ts';

import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

import { ClassroomTeachingPlan } from '#/components/classroom/ClassroomTeachingPlan';
import { FollowwLogo } from '#/components/FollowwLogo';

export function ClassroomTeachingPlanPage({
    classroom,
    plan
}: {
    classroom: Classroom;
    plan: TeachingPlan;
}) {
    return (
        <main className="min-h-dvh bg-background px-6 py-10 text-foreground">
            <div className="mx-auto flex max-w-2xl flex-col gap-12">
                <header className="flex flex-col gap-8">
                    <Link
                        to="/turmas/$id"
                        params={{ id: classroom.id }}
                        className="flex w-fit items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
                    >
                        <ArrowLeft className="size-4" aria-hidden />
                        Voltar à turma
                    </Link>
                    <div className="flex flex-col gap-3">
                        <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <FollowwLogo className="size-5 shrink-0" />
                            Plano de ensino
                        </p>
                        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                            {classroom.subject.name}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            <span className="font-semibold text-primary">
                                {classroom.subject.code}
                            </span>
                            {` · Turma ${classroom.number} · ${classroom.semester}`}
                        </p>
                    </div>
                </header>
                <ClassroomTeachingPlan plan={plan} />
            </div>
        </main>
    );
}
