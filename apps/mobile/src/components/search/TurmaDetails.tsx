import { unitLabel } from '@followw/core/lib/profile.ts';
import { describeSchedule } from '@followw/core/lib/schedule.ts';
import { displayedRequirements, seats } from '@followw/core/queries/subjects.ts';
import { View } from 'react-native';

import type { TurmaProps } from '@/components/search/TurmaCard';

import { RequirementList } from '@/components/search/RequirementList';
import { OCCUPANCY_COLOR } from '@/components/search/Seats';
import { SubjectDisclosure } from '@/components/search/SubjectDisclosure';
import { SubjectSearchLink } from '@/components/search/SubjectSearchLink';
import { SubjectStatistics } from '@/components/search/SubjectStatistics';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export function TurmaDetails({ subject, classroom }: TurmaProps) {
    const { prerequisites, corequisites, equivalences } = displayedRequirements(subject);
    const status = seats(classroom);

    return (
        <View className="gap-4">
            <View className="flex-row flex-wrap gap-x-4 gap-y-3 rounded-xl bg-muted/40 p-4">
                <Detail label="Horário" full>
                    <Text className="text-sm font-medium text-primary">
                        {describeSchedule(classroom.schedule) ?? 'Horário a definir'}
                    </Text>
                </Detail>
                <Detail label="Local">
                    <Value>{classroom.room ?? 'Local não informado'}</Value>
                </Detail>
                <Detail label="Unidade">
                    <Value>
                        {subject.unit ? unitLabel(subject.unit) : 'Unidade não informada'}
                    </Value>
                </Detail>
                <Detail label="Docentes" full>
                    {classroom.professors.length > 0 ? (
                        classroom.professors.map(({ name }) => (
                            <SubjectSearchLink key={name} query={name}>
                                {name}
                            </SubjectSearchLink>
                        ))
                    ) : (
                        <Value>Docentes não informados</Value>
                    )}
                </Detail>
                <Detail label="Carga horária">
                    <Value>
                        {subject.hours == null ? 'Não informada' : `${subject.hours} horas`}
                    </Value>
                </Detail>
                <Detail label="Vagas">
                    <Text
                        className={cn(
                            'text-sm font-medium',
                            status && OCCUPANCY_COLOR[status.occupancy]
                        )}
                    >
                        {status ? `${status.occupied}/${status.vacancies}` : 'Não informadas'}
                    </Text>
                </Detail>
                {subject.prerequisites?.length ? (
                    <Detail label="Pré-requisitos" full>
                        <RequirementList requirements={prerequisites ?? []} />
                    </Detail>
                ) : null}
                {subject.corequisites?.length ? (
                    <Detail label="Correquisitos" full>
                        <Text className="text-xs font-normal text-muted-foreground">
                            Podem ser cursados junto com esta matéria, conforme a regra acadêmica.
                        </Text>
                        <RequirementList requirements={corequisites ?? []} />
                    </Detail>
                ) : null}
                {equivalences?.length ? (
                    <Detail label="Equivalências" full>
                        <RequirementList requirements={equivalences} />
                    </Detail>
                ) : null}
                {subject.unlocks?.length ? (
                    <Detail label="Desbloqueia" full>
                        <SubjectDisclosure count={subject.unlocks.length}>
                            {subject.unlocks.map((item) => (
                                <SubjectSearchLink key={item.code} query={item.code}>
                                    {item.name}
                                </SubjectSearchLink>
                            ))}
                        </SubjectDisclosure>
                    </Detail>
                ) : null}
            </View>
            <SubjectStatistics
                key={`${subject.code}/${classroom.semester}/${classroom.number}`}
                code={subject.code}
                classroom={classroom}
            />
        </View>
    );
}

function Value({ children }: { children: React.ReactNode }) {
    return <Text className="text-sm font-medium">{children}</Text>;
}

function Detail({
    label,
    children,
    full
}: {
    label: string;
    children: React.ReactNode;
    full?: boolean;
}) {
    return (
        <View className={cn('min-w-0 gap-1', full ? 'w-full' : 'min-w-[40%] flex-1')}>
            <Text className="text-xs text-muted-foreground">{label}</Text>
            {children}
        </View>
    );
}
