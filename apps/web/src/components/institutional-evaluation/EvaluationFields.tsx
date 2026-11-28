import type {
    EvaluationAnswers,
    EvaluationChoice,
    InstitutionalQuestionnaire
} from '@followw/core/queries/institutional-evaluations.ts';

import { ChevronDown } from 'lucide-react';

type FieldChange = (field: string, original: string | null, value: string) => void;

const selectClassName =
    'min-h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring';

export function fieldValue(edits: EvaluationAnswers, field: string, original: string | null) {
    return (Object.hasOwn(edits, field) ? edits[field] : original) ?? '';
}

function Options({ choices }: { choices: EvaluationChoice[] }) {
    const labels = new Map<string, string>();
    for (const choice of choices) {
        if (!labels.has(choice.value)) labels.set(choice.value, choice.label);
    }
    return [...labels].map(([value, label]) => (
        <option key={value} value={value}>
            {label}
        </option>
    ));
}

export function EvaluationFields({
    questionnaire,
    edits,
    onChange,
    disabled
}: {
    questionnaire: InstitutionalQuestionnaire;
    edits: EvaluationAnswers;
    onChange: FieldChange;
    disabled: boolean;
}) {
    return (
        <fieldset
            aria-label="Respostas da avaliação"
            disabled={disabled}
            className="flex min-w-0 flex-col gap-3 disabled:opacity-70"
        >
            {questionnaire.targets.map((target, index) => {
                const answered = target.questions.filter(
                    (question) => fieldValue(edits, question.field, question.answer) !== ''
                ).length;
                return (
                    <details
                        key={target.questions[0]?.field}
                        open={index === 0}
                        className="group rounded-2xl border border-border bg-card"
                    >
                        <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                                <span className="font-medium">{target.classroom_label}</span>
                                <span className="text-sm text-muted-foreground">
                                    {target.instructor}
                                </span>
                            </span>
                            <span className="text-sm text-muted-foreground tabular-nums">
                                {answered}/{target.questions.length}
                            </span>
                            <ChevronDown
                                className="size-4 shrink-0 group-open:rotate-180"
                                aria-hidden="true"
                            />
                        </summary>
                        <div className="divide-y divide-border border-t border-border px-4">
                            {target.questions.map((question) => (
                                <label
                                    className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                                    key={question.field}
                                >
                                    {question.prompt}
                                    <select
                                        className={selectClassName}
                                        value={fieldValue(edits, question.field, question.answer)}
                                        onChange={(event) =>
                                            onChange(
                                                question.field,
                                                question.answer,
                                                event.currentTarget.value
                                            )
                                        }
                                    >
                                        <option value="">Sem resposta</option>
                                        <Options choices={question.choices} />
                                    </select>
                                </label>
                            ))}
                        </div>
                    </details>
                );
            })}
            {questionnaire.comments.length > 0 && (
                <details className="group rounded-2xl border border-border bg-card">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-medium">
                        Comentários opcionais
                        <ChevronDown
                            className="size-4 shrink-0 group-open:rotate-180"
                            aria-hidden="true"
                        />
                    </summary>
                    <div className="flex flex-col gap-5 border-t border-border p-4">
                        {questionnaire.comments.map((comment) => {
                            const instructorField = comment.instructor_field;
                            return (
                                <div key={comment.field} className="flex flex-col gap-2 text-sm">
                                    <label className="flex flex-col gap-2">
                                        <span className="font-medium">{comment.label}</span>
                                        <textarea
                                            rows={3}
                                            maxLength={600}
                                            className="w-full resize-y rounded-md border border-input bg-background p-3 focus-visible:ring-2 focus-visible:ring-ring"
                                            value={fieldValue(edits, comment.field, comment.text)}
                                            onChange={(event) =>
                                                onChange(
                                                    comment.field,
                                                    comment.text,
                                                    event.currentTarget.value
                                                )
                                            }
                                        />
                                    </label>
                                    {instructorField && (
                                        <label className="flex flex-wrap items-center gap-2">
                                            <span>Docente referente ao comentário</span>
                                            <select
                                                className={selectClassName}
                                                value={fieldValue(
                                                    edits,
                                                    instructorField,
                                                    comment.instructor_answer
                                                )}
                                                onChange={(event) =>
                                                    onChange(
                                                        instructorField,
                                                        comment.instructor_answer,
                                                        event.currentTarget.value
                                                    )
                                                }
                                            >
                                                <Options
                                                    choices={comment.instructor_choices ?? []}
                                                />
                                            </select>
                                        </label>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </details>
            )}
        </fieldset>
    );
}
