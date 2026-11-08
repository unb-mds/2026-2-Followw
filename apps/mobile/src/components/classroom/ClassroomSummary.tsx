import type { Classroom } from '@followw/core/queries/classrooms.ts';
import type { LucideIcon } from 'lucide-react-native';

import { describeSchedule } from '@followw/core/lib/schedule.ts';
import { finalGrade } from '@followw/core/queries/classrooms.ts';
import { Award, Clock3, Hourglass, MapPin } from 'lucide-react-native';
import { View } from 'react-native';

import { GradeText } from '@/components/classroom/GradeText';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export function ClassroomSummary({ classroom }: { classroom: Classroom }) {
    const schedule = describeSchedule(classroom.schedule);
    const grade = finalGrade(classroom);
    return (
        <View>
            <Text className="text-xs font-medium tracking-wide text-muted-foreground">
                <Text className="text-xs font-semibold text-primary">{classroom.subject.code}</Text>
                {` · Turma ${classroom.number} · ${classroom.semester}`}
            </Text>
            <Text
                role="heading"
                aria-level={1}
                className="mt-1 text-xl leading-tight font-semibold tracking-tight"
            >
                {classroom.subject.name}
            </Text>
            <View className="mt-3 flex-col gap-1">
                <SummaryItem icon={Clock3}>
                    <Text className="text-sm font-medium text-primary">
                        {schedule ?? 'Horário a definir'}
                    </Text>
                </SummaryItem>
                {classroom.current ? (
                    <SummaryItem icon={MapPin}>
                        <Text className="text-sm text-muted-foreground">
                            {classroom.room ?? 'Local não informado'}
                        </Text>
                    </SummaryItem>
                ) : (
                    <SummaryItem icon={Award}>
                        {grade ? (
                            <GradeText grade={grade} className="text-sm" />
                        ) : (
                            <Text className="text-sm text-muted-foreground">
                                Menção não disponível
                            </Text>
                        )}
                    </SummaryItem>
                )}
                {classroom.subject.hours != null && (
                    <SummaryItem icon={Hourglass}>
                        <Text className="text-sm text-muted-foreground">
                            {classroom.subject.hours}h
                        </Text>
                    </SummaryItem>
                )}
            </View>
        </View>
    );
}

function SummaryItem({ icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
    return (
        <View className="flex-row items-start gap-2">
            <Icon as={icon} className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
            <View className="min-w-0 flex-1 flex-row">{children}</View>
        </View>
    );
}
