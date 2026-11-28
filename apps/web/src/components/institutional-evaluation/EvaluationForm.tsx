import type {
    EvaluationAnswers,
    InstitutionalQuestionnaire
} from '@followw/core/queries/institutional-evaluations.ts';

import { formatClassroomDate } from '@followw/core/lib/classroom-details.ts';
import { useOnline } from '@followw/core/lib/online.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { Link } from '@tanstack/react-router';
import { CircleCheck, Save, Send } from 'lucide-react';
import { useState } from 'react';

import {
    EvaluationFields,
    fieldValue
} from '#/components/institutional-evaluation/EvaluationFields';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from '#/components/ui/alert-dialog';
import { Button, buttonVariants } from '#/components/ui/button';
import { Card } from '#/components/ui/card';
import { Progress } from '#/components/ui/progress';
import { Markdown } from '#/lib/markdown';
import { useEvaluationActions } from '#/queries/institutional-evaluations';

function writeError(error: Error) {
    if (error instanceof ApiError && typeof error.detail === 'string') return error.detail;
    return 'Não foi possível confirmar a gravação no SIGAA.';
}

function isUnconfirmed(error: unknown) {
    return !(error instanceof ApiError) || error.isServerError;
}

export function EvaluationForm({
    questionnaire,
    onCheck
}: {
    questionnaire: InstitutionalQuestionnaire;
    onCheck: () => Promise<boolean>;
}) {
    const { evaluation } = questionnaire;
    const { save, submit } = useEvaluationActions(evaluation.sigaa_id);
    const online = useOnline();
    const [edits, setEdits] = useState<EvaluationAnswers>({});
    const [confirm, setConfirm] = useState(false);
    const [checking, setChecking] = useState(false);
    const questions = questionnaire.targets.flatMap((target) => target.questions);
    const answered = questions.filter(
        (question) => fieldValue(edits, question.field, question.answer) !== ''
    ).length;
    const hasEdits = Object.keys(edits).length > 0;
    const pending = save.isPending || submit.isPending || checking;
    const uncertain = submit.isError && isUnconfirmed(submit.error);
    const disabled = !online || pending || uncertain;
    const request = {
        params: { path: { evaluation_id: evaluation.sigaa_id } },
        body: { answers: edits }
    };

    function change(field: string, original: string | null, value: string) {
        setEdits((previous) => {
            const next = { ...previous };
            if (value === (original ?? '')) delete next[field];
            else next[field] = value === '' ? null : value;
            return next;
        });
    }

    async function check() {
        setChecking(true);
        try {
            if (await onCheck()) submit.reset();
        } finally {
            setChecking(false);
        }
    }

    if (submit.data) {
        return (
            <Card className="mx-auto max-w-3xl items-start gap-3 p-5">
                <div className="flex items-start gap-3">
                    <CircleCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
                    <div>
                        <h2 className="font-semibold">Avaliação enviada</h2>
                        <output className="text-sm text-muted-foreground">
                            {submit.data.confirmation}
                        </output>
                    </div>
                </div>
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

    const error = submit.error ?? save.error;
    return (
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
            <Card className="gap-3 p-4 sm:p-5">
                <div className="flex flex-col gap-1">
                    <h2 className="text-lg font-semibold">{evaluation.title}</h2>
                    <p className="text-sm text-muted-foreground">
                        {evaluation.semester} · Até{' '}
                        {formatClassroomDate(evaluation.response_ends_on)}
                    </p>
                </div>
                <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">
                        {answered} de {questions.length} respostas
                    </p>
                    <Progress
                        value={questions.length ? (answered / questions.length) * 100 : 0}
                        aria-label="Progresso das respostas"
                    />
                </div>
                {questionnaire.instructions && (
                    <details className="text-sm">
                        <summary className="cursor-pointer font-medium">
                            Orientações do SIGAA
                        </summary>
                        <div className="mt-2">
                            <Markdown>{questionnaire.instructions}</Markdown>
                        </div>
                    </details>
                )}
            </Card>

            <EvaluationFields
                questionnaire={questionnaire}
                edits={edits}
                onChange={change}
                disabled={pending}
            />

            <div className="flex flex-col gap-3">
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {writeError(error)}
                    </p>
                )}
                {uncertain && (
                    <Button
                        type="button"
                        variant="outline"
                        disabled={pending || !online}
                        onClick={() => void check()}
                    >
                        {checking ? 'Consultando...' : 'Consultar situação no SIGAA'}
                    </Button>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <output className="text-sm text-muted-foreground">
                        {hasEdits
                            ? 'Alterações ainda não salvas'
                            : save.isSuccess
                              ? 'Rascunho salvo no SIGAA'
                              : ''}
                    </output>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={disabled || !hasEdits}
                            onClick={() => {
                                submit.reset();
                                save.mutate(request, { onSuccess: () => setEdits({}) });
                            }}
                        >
                            <Save aria-hidden="true" />
                            {save.isPending ? 'Salvando...' : 'Salvar rascunho'}
                        </Button>
                        <AlertDialog open={confirm} onOpenChange={setConfirm}>
                            <AlertDialogTrigger
                                disabled={disabled}
                                render={<Button type="button" />}
                            >
                                <Send aria-hidden="true" />
                                {submit.isPending ? 'Enviando...' : 'Enviar avaliação'}
                            </AlertDialogTrigger>
                            <AlertDialogContent size="sm">
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Enviar avaliação?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Você respondeu {answered} de {questions.length} perguntas.
                                        Ao confirmar, o SIGAA receberá suas respostas para finalizar
                                        a avaliação.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Continuar editando</AlertDialogCancel>
                                    <AlertDialogAction
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => {
                                            setConfirm(false);
                                            save.reset();
                                            submit.mutate(request);
                                        }}
                                    >
                                        Confirmar envio
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>
            </div>
        </div>
    );
}
