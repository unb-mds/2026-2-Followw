import { titleCase } from '@followw/core/lib/profile.ts';
import { type CoursePage, coursesQueryOptions } from '@followw/core/queries/courses.ts';
import { useRouter } from 'expo-router';
import { GraduationCap } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { PagedSection } from '@/components/search/PagedSection';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export function CourseSection({
    page,
    q,
    onShowAll
}: {
    page: CoursePage;
    q: string | null;
    onShowAll?: () => void;
}) {
    const router = useRouter();
    return (
        <PagedSection
            title="Cursos"
            count={`${page.total} ${page.total === 1 ? 'curso' : 'cursos'}`}
            noun="cursos"
            first={page}
            pageOptions={(number) => coursesQueryOptions(q, number)}
            onShowAll={onShowAll}
        >
            {(courses) => (
                <View className="gap-3">
                    {courses.map((course) => (
                        <Pressable
                            key={course.id}
                            accessibilityRole="link"
                            accessibilityHint="Abrir fluxograma do curso"
                            onPress={() =>
                                router.push({
                                    pathname: '/cursos/[id]',
                                    params: { id: String(course.id) }
                                })
                            }
                            className="flex-row items-center gap-4 rounded-2xl border border-border bg-card p-4 active:bg-primary/5"
                        >
                            <View className="size-14 items-center justify-center rounded-xl bg-primary/10">
                                <Icon as={GraduationCap} className="size-8 text-primary" />
                            </View>
                            <View className="min-w-0 flex-1 gap-1.5">
                                <Text className="text-base leading-snug font-semibold">
                                    {titleCase(course.name)}
                                </Text>
                                <Text className="text-sm font-medium text-primary">
                                    {course.level ?? 'Curso'}
                                    {course.shift && ` · ${titleCase(course.shift)}`}
                                </Text>
                                <Text className="text-xs text-muted-foreground">
                                    {titleCase(course.unit.name)}
                                </Text>
                            </View>
                        </Pressable>
                    ))}
                </View>
            )}
        </PagedSection>
    );
}
