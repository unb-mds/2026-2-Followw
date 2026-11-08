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
            className="flex-row items-center justify-between gap-3 rounded-2xl border border-foreground/10 bg-card p-3 shadow-sm shadow-black/5 active:border-primary/40"
        >
            <View className="min-w-0 flex-1 flex-row items-center gap-3">
                <PersonPhoto src={professor.photo} size="sm" />
                <View className="min-w-0 flex-1 gap-0.5">
                    <Text numberOfLines={1} className="text-sm font-semibold text-foreground">
                        {titleCase(professor.name)}
                    </Text>
                    <Text numberOfLines={1} className="text-xs text-muted-foreground">
                        {unitLabel(professor.unit)}
                    </Text>
                </View>
            </View>
            <Icon as={ChevronRight} className="size-4 shrink-0 text-muted-foreground" />
        </Pressable>
    );
}
