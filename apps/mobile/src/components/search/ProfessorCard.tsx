import type { ProfessorItem } from '@followw/core/queries/professors.ts';

import { titleCase, unitLabel } from '@followw/core/lib/profile.ts';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { PersonPhoto } from '@/components/PersonPhoto';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export function ProfessorCard({ professor }: { professor: ProfessorItem }) {
    const router = useRouter();
    return (
        <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Ver perfil de ${titleCase(professor.name)}`}
            onPress={() =>
                router.push({
                    pathname: '/professores/[siape]',
                    params: { siape: String(professor.siape) }
                })
            }
            className="flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 active:bg-primary/5"
        >
            <PersonPhoto src={professor.photo} size="sm" />
            <View className="min-w-0 flex-1 gap-0.5">
                <Text numberOfLines={1} className="text-sm font-semibold">
                    {titleCase(professor.name)}
                </Text>
                <Text numberOfLines={1} className="text-xs text-muted-foreground">
                    {unitLabel(professor.unit)}
                </Text>
            </View>
            <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
        </Pressable>
    );
}
