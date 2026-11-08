import type {
    ProfessorDegree,
    ProfessorDetails,
    ProfessorDiscipline
} from '@followw/core/queries/professors.ts';

import { titleCase } from '@followw/core/lib/profile.ts';
import { useRouter } from 'expo-router';
import {
    BookOpen,
    Calendar,
    GraduationCap,
    Lightbulb,
    type LucideIcon,
    User
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { openSearch } from '@/components/search/SubjectSearchLink';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

const INITIAL_SEMESTERS_COUNT = 6;

// semestres do mais recente ao mais antigo, matérias por código
function groupBySemester(disciplines: ProfessorDiscipline[]) {
    const groups = new Map<string, ProfessorDiscipline[]>();
    for (const item of disciplines) {
        const group = groups.get(item.semester);
        if (group) group.push(item);
        else groups.set(item.semester, [item]);
    }
    return [...groups]
        .toSorted(([a], [b]) => b.localeCompare(a))
        .map(([semester, items]) => ({
            semester,
            items: items.toSorted((a, b) => a.code.localeCompare(b.code))
        }));
}

export function ProfessorDetailsSection({ professor }: { professor: ProfessorDetails }) {
    const router = useRouter();
    const [showAllSemesters, setShowAllSemesters] = useState(false);
    const semesters = useMemo(
        () => groupBySemester(professor.disciplines),
        [professor.disciplines]
    );
    const hiddenSemesters = semesters.length - INITIAL_SEMESTERS_COUNT;
    const displayedSemesters = showAllSemesters
        ? semesters
        : semesters.slice(0, INITIAL_SEMESTERS_COUNT);

    return (
        <View className="gap-4">
            {professor.description && (
                <DetailCard icon={User} title="Sobre">
                    <Text className="text-sm leading-relaxed font-normal text-muted-foreground">
                        {professor.description}
                    </Text>
                </DetailCard>
            )}

            {professor.interests && (
                <DetailCard icon={Lightbulb} title="Áreas de Interesse">
                    <Text className="text-sm leading-relaxed font-normal text-muted-foreground">
                        {professor.interests}
                    </Text>
                </DetailCard>
            )}

            {professor.education.length > 0 && (
                <DetailCard icon={GraduationCap} title="Formação Acadêmica">
                    <View className="gap-3">
                        {professor.education.map((degree) => (
                            <DegreeItem
                                key={`${degree.level}-${degree.course ?? ''}-${degree.institution ?? ''}-${degree.start_year ?? ''}`}
                                degree={degree}
                            />
                        ))}
                    </View>
                </DetailCard>
            )}

            {semesters.length > 0 && (
                <DetailCard icon={BookOpen} title="Disciplinas de Graduação Ministradas">
                    <View className="gap-5">
                        {displayedSemesters.map((group) => (
                            <View key={group.semester} className="gap-2">
                                <Text className="text-sm font-bold">{group.semester}</Text>
                                {group.items.map((item) => (
                                    <Pressable
                                        key={item.code}
                                        accessibilityRole="link"
                                        accessibilityLabel={`Buscar ${item.name ?? `matéria ${item.code}`}`}
                                        onPress={() => openSearch(router, item.code)}
                                        className="flex-row items-baseline gap-2 active:opacity-60"
                                    >
                                        <Text className="min-w-0 flex-1 text-sm font-normal">
                                            {item.name ?? 'Matéria desconhecida'}
                                        </Text>
                                        {item.occurrences > 1 && (
                                            <Text className="shrink-0 text-xs font-normal text-muted-foreground">
                                                {item.occurrences} turmas
                                            </Text>
                                        )}
                                    </Pressable>
                                ))}
                            </View>
                        ))}
                        {hiddenSemesters > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onPress={() => setShowAllSemesters((prev) => !prev)}
                            >
                                <Text className="text-xs text-muted-foreground">
                                    {showAllSemesters
                                        ? 'Mostrar menos semestres'
                                        : `Ver mais semestres (${hiddenSemesters} restantes)`}
                                </Text>
                            </Button>
                        )}
                    </View>
                </DetailCard>
            )}
        </View>
    );
}

function DetailCard({
    icon,
    title,
    children
}: {
    icon: LucideIcon;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <Card>
            <CardHeader>
                <View className="flex-row items-center gap-2">
                    <Icon as={icon} className="size-4 text-primary" />
                    <Text role="heading" aria-level={2} className="text-sm font-semibold">
                        {title}
                    </Text>
                </View>
            </CardHeader>
            <CardContent>{children}</CardContent>
        </Card>
    );
}

function DegreeItem({ degree }: { degree: ProfessorDegree }) {
    const period =
        degree.start_year && degree.end_year
            ? `${degree.start_year} - ${degree.end_year}`
            : degree.end_year || degree.start_year || null;

    return (
        <View className="gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-3">
            <View className="flex-row items-center justify-between gap-2">
                <Text className="flex-1 text-xs font-semibold">{titleCase(degree.level)}</Text>
                {period && (
                    <View className="flex-row items-center gap-1">
                        <Icon as={Calendar} className="size-3 text-muted-foreground" />
                        <Text className="text-xs font-normal text-muted-foreground">{period}</Text>
                    </View>
                )}
            </View>
            {degree.course && <Text className="text-xs font-medium">{degree.course}</Text>}
            {degree.institution && (
                <Text className="text-xs font-normal text-muted-foreground">
                    {titleCase(degree.institution)}
                </Text>
            )}
        </View>
    );
}
