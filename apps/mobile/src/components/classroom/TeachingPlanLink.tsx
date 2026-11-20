import { useRouter } from 'expo-router';
import { BookOpen } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { ListCard } from '@/components/ListCard';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export function TeachingPlanLink({ id }: { id: string }) {
    const router = useRouter();
    return (
        <ListCard>
            <Pressable
                accessibilityRole="link"
                onPress={() =>
                    router.push({ pathname: '/turmas/[id]/plano-de-ensino', params: { id } })
                }
                className="min-h-11 flex-row items-center gap-3 py-3 active:opacity-70"
            >
                <Icon as={BookOpen} className="size-4 shrink-0 text-primary" />
                <Text className="text-sm font-semibold">Plano de ensino</Text>
            </Pressable>
        </ListCard>
    );
}
