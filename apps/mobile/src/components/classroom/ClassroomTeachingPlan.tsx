import type { TeachingPlan } from '@followw/core/queries/classrooms.ts';

import { formatClassroomDate } from '@followw/core/lib/classroom-details.ts';
import { View } from 'react-native';

import { Markdown } from '@/components/Markdown';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export function ClassroomTeachingPlan({ plan }: { plan: TeachingPlan }) {
    return (
        <View accessibilityLabel="Plano de ensino" className="min-w-0 gap-10">
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
        </View>
    );
}

function PlanTitle({ children }: { children: string }) {
    return (
        <Text role="heading" aria-level={2} className="text-2xl font-bold tracking-tight">
            {children}
        </Text>
    );
}

function PlanText({ title, content }: { title: string; content: string | null }) {
    if (!content?.trim()) return null;
    return (
        <View className="gap-3">
            <PlanTitle>{title}</PlanTitle>
            <Markdown article>{content}</Markdown>
        </View>
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
        <View className="min-w-0 gap-3">
            <PlanTitle>{title}</PlanTitle>
            <View accessibilityLabel={title}>
                {populated.map((row, index) => (
                    <View
                        key={index}
                        className={cn(
                            'gap-2 py-3',
                            index === 0 && 'pt-0',
                            index === populated.length - 1 && 'pb-0',
                            index > 0 && 'border-t border-border'
                        )}
                    >
                        {fields.map(({ label, index: cellIndex }) =>
                            row[cellIndex]?.trim() ? (
                                <View key={label} className="gap-1">
                                    <Text className="text-sm font-medium">{label}</Text>
                                    <Text className="text-sm">{row[cellIndex]}</Text>
                                </View>
                            ) : null
                        )}
                    </View>
                ))}
            </View>
        </View>
    );
}
