import type { TeachingPlan } from '@followw/core/queries/classrooms.ts';

import { formatClassroomDate } from '@followw/core/lib/classroom-details.ts';
import { BookOpen } from 'lucide-react';

import { ErrorCard, StaleDataNotice } from '#/components/ErrorState';
import { ListCard } from '#/components/ListCard';
import { LoadingText } from '#/components/LoadingText';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from '#/components/ui/accordion';
import { Button } from '#/components/ui/button';
import { Markdown } from '#/lib/markdown';

interface TeachingPlanProps {
    data: TeachingPlan | null | undefined;
    isPending: boolean;
    isError: boolean;
    onRetry: () => void;
}

export function ClassroomTeachingPlan({ data, isPending, isError, onRetry }: TeachingPlanProps) {
    if (isPending)
        return (
            <output className="px-1 text-sm text-muted-foreground">
                <LoadingText>Consultando plano de ensino...</LoadingText>
            </output>
        );
    if (data === undefined)
        return (
            <ErrorCard message="Não foi possível consultar o plano de ensino." onRetry={onRetry} />
        );
    if (data === null && !isError) return null;

    return (
        <div className="flex flex-col gap-3">
            {isError && (
                <div className="flex flex-wrap items-center gap-2">
                    <StaleDataNotice subject="o plano de ensino" />
                    <Button variant="ghost" size="sm" onClick={onRetry}>
                        Tentar novamente
                    </Button>
                </div>
            )}
            {data !== null && (
                <ListCard>
                    <Accordion>
                        <AccordionItem value="teaching-plan">
                            <AccordionTrigger className="min-h-11 items-center gap-3 py-3 hover:no-underline">
                                <BookOpen aria-hidden className="size-4 shrink-0 text-primary" />
                                <span className="flex-1 font-semibold">Plano de ensino</span>
                            </AccordionTrigger>
                            <AccordionContent className="pb-4">
                                <TeachingPlanContent plan={data} />
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </ListCard>
            )}
        </div>
    );
}

function TeachingPlanContent({ plan }: { plan: TeachingPlan }) {
    return (
        <div className="flex min-w-0 flex-col gap-6 pt-2">
            <PlanText title="Metodologia" content={plan.methodology} />
            <PlanText title="Critérios de avaliação" content={plan.assessment_procedures} />
            <PlanText title="Horário de atendimento" content={plan.office_hours} />
            <PlanRows
                title="Cronograma de aulas"
                columns={['Início', 'Fim', 'Descrição']}
                rows={plan.schedule.map((entry) => [
                    formatClassroomDate(entry.start_date),
                    formatClassroomDate(entry.end_date),
                    entry.description
                ])}
            />
            <PlanRows
                title="Avaliações"
                columns={['Data', 'Descrição']}
                rows={plan.assessments.map((entry) => [
                    formatClassroomDate(entry.date),
                    entry.description
                ])}
            />
            <PlanRows
                title="Referências básicas"
                columns={['Tipo de material', 'Descrição']}
                rows={plan.basic_references.map((entry) => [
                    entry.material_type,
                    entry.description
                ])}
            />
            <PlanRows
                title="Referências complementares"
                columns={['Tipo de material', 'Descrição']}
                rows={plan.complementary_references.map((entry) => [
                    entry.material_type,
                    entry.description
                ])}
            />
        </div>
    );
}

function PlanText({ title, content }: { title: string; content: string | null }) {
    if (!content?.trim()) return null;
    return (
        <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">{title}</h3>
            <Markdown>{content}</Markdown>
        </section>
    );
}

/* oxlint-disable react/no-array-index-key -- A origem não fornece IDs e contém linhas repetidas; as células não têm estado. */
function PlanRows({
    title,
    columns,
    rows
}: {
    title: string;
    columns: string[];
    rows: (string | null)[][];
}) {
    const populated = rows.filter((row) => row.some((cell) => cell?.trim()));
    if (populated.length === 0) return null;
    const fields = columns
        .map((label, index) => ({ label, index }))
        .filter(({ index }) => populated.some((row) => row[index]?.trim()));
    return (
        <section className="flex min-w-0 flex-col gap-3">
            <h3 className="text-sm font-semibold">{title}</h3>
            <table aria-label={title} className="hidden w-full text-left text-sm lg:table">
                <thead className="border-b border-border bg-muted/50 text-muted-foreground">
                    <tr>
                        {fields.map(({ label }) => (
                            <th key={label} scope="col" className="px-3 py-2 font-medium">
                                {label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {populated.map((row, index) => (
                        <tr key={index}>
                            {fields.map(({ label, index: cellIndex }) => (
                                <td
                                    key={label}
                                    className="px-3 py-3 align-top wrap-anywhere text-muted-foreground"
                                >
                                    {row[cellIndex]}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            <ul aria-label={title} className="flex flex-col divide-y divide-border lg:hidden">
                {populated.map((row, index) => (
                    <li key={index} className="py-3 first:pt-0 last:pb-0">
                        <dl className="flex flex-col gap-2 text-sm">
                            {fields.map(({ label, index: cellIndex }) =>
                                row[cellIndex]?.trim() ? (
                                    <div key={label} className="flex flex-col gap-1">
                                        <dt className="font-medium">{label}</dt>
                                        <dd className="wrap-anywhere text-muted-foreground">
                                            {row[cellIndex]}
                                        </dd>
                                    </div>
                                ) : null
                            )}
                        </dl>
                    </li>
                ))}
            </ul>
        </section>
    );
}
