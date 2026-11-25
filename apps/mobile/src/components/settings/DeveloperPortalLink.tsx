import { openBrowserAsync } from 'expo-web-browser';
import { ChevronRight, Code2 } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { WEB_ORIGIN } from '@/lib/share';
import { cn } from '@/lib/utils';

// o portal fica só no site; abre no navegador
export function DeveloperPortalLink({ bordered }: { bordered: boolean }) {
    return (
        <Pressable
            accessibilityRole="link"
            onPress={() => void openBrowserAsync(`${WEB_ORIGIN}/developers`)}
            className={cn(
                'min-h-12 flex-row items-center gap-3 px-4 py-2.5 active:bg-accent',
                bordered && 'border-t border-border'
            )}
        >
            <View className="size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Icon as={Code2} className="size-4 text-primary" />
            </View>
            <Text className="flex-1">Portal de desenvolvedores</Text>
            <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
        </Pressable>
    );
}
