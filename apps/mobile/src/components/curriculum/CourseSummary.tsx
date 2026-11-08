import type { PublicCourse } from '@followw/core/queries/courses.ts';
import type { LucideIcon } from 'lucide-react-native';

import { normalizeCurriculum } from '@followw/core/lib/curriculum/model.ts';
import { titleCase, unitLabel } from '@followw/core/lib/profile.ts';
import { courseQueryOptions } from '@followw/core/queries/courses.ts';
import { curriculumQueryOptions, shiftLabels } from '@followw/core/queries/curriculum.ts';
import { useQuery } from '@tanstack/react-query';
import { Building2, Clock3, GraduationCap, Layers } from 'lucide-react-native';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export interface CourseSummaryProps {
    course: Pick<PublicCourse, 'id' | 'name' | 'shift'>;
    entrySemester?: string | null;
}

/** Erros e carregamento ficam com a página; aqui só o que já estiver em cache. */
export function CourseSummary({ course, entrySemester }: CourseSummaryProps) {
    const listed = useQuery(courseQueryOptions(course.id));
    const matrix = useQuery({
        ...curriculumQueryOptions(course.id, entrySemester ?? ''),
        enabled: Boolean(entrySemester)
    });
    const unit = listed.data?.unit;
    const curriculum = matrix.data;
    const shift = course.shift ?? (curriculum?.shift && shiftLabels[curriculum.shift]);
    const flow = useMemo(() => (curriculum ? normalizeCurriculum(curriculum) : null), [curriculum]);
    const meta = curriculum && `Matriz ${curriculum.code} - ${curriculum.valid_from}`;

    return (
        <View accessibilityLabel="Informações do curso">
            <Text className="text-xs font-medium tracking-wide text-muted-foreground">
                {unit?.code && (
                    <Text className="text-xs font-semibold text-primary">{unit.code}</Text>
                )}
                {unit?.code && meta && ' · '}
                {meta}
            </Text>
            <Text
                role="heading"
                aria-level={2}
                className="mt-1 text-xl leading-tight font-semibold tracking-tight"
            >
                {course.name}
            </Text>
            <View className="mt-3 gap-1">
                <SummaryItem icon={Clock3}>
                    <Text className="text-sm font-medium text-primary">
                        {[shift ? titleCase(shift) : 'Turno não informado', curriculum?.modality]
                            .filter(Boolean)
                            .join(' · ')}
                    </Text>
                </SummaryItem>
                {curriculum?.degree && (
                    <SummaryItem icon={GraduationCap}>
                        <Text className="text-sm text-muted-foreground">
                            {titleCase(curriculum.degree)}
                        </Text>
                    </SummaryItem>
                )}
                <SummaryItem icon={Building2}>
                    <Text className="text-sm text-muted-foreground">
                        {unit ? unitLabel({ name: unit.name }) : 'Unidade não informada'}
                    </Text>
                </SummaryItem>
                {curriculum && flow && (
                    <SummaryItem icon={Layers}>
                        <Text className="text-sm text-muted-foreground">
                            {[
                                plural(flow.periods.length, 'semestre', 'semestres'),
                                plural(
                                    flow.subjects.length,
                                    'matéria obrigatória',
                                    'matérias obrigatórias'
                                )
                            ].join(' · ')}
                        </Text>
                    </SummaryItem>
                )}
            </View>
        </View>
    );
}

function plural(count: number, one: string, many: string) {
    return `${count} ${count === 1 ? one : many}`;
}

function SummaryItem({ icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
    return (
        <View className="flex-row items-start gap-2">
            <Icon as={icon} className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
            <View className="min-w-0 flex-1">{children}</View>
        </View>
    );
}
