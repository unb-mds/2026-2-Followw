import { Unplug } from 'lucide-react-native';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export function NoGrants() {
    return (
        <View className="items-center gap-3 px-6 py-10">
            <View className="size-12 items-center justify-center rounded-full bg-primary/10">
                <Icon as={Unplug} className="size-6 text-primary" />
            </View>
            <View className="max-w-sm items-center gap-1">
                <Text role="heading" aria-level={3} className="font-semibold">
                    Nenhum app conectado
                </Text>
                <Text className="text-center text-sm text-muted-foreground">
                    Quando você autorizar um app a acessar seus dados pelo Followw, ele aparecerá
                    aqui e você poderá revogar o acesso a qualquer momento.
                </Text>
            </View>
        </View>
    );
}
