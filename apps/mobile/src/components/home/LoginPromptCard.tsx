import { useRouter } from 'expo-router';
import { ArrowRight, Lock } from 'lucide-react-native';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export function LoginPromptCard() {
    const router = useRouter();
    return (
        <Card>
            <CardContent className="flex-row items-start gap-4">
                <View className="size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Icon as={Lock} className="size-6 text-primary" />
                </View>
                <View className="flex-1">
                    <Text className="text-lg font-bold tracking-tight">
                        Acesse com sua Matrícula UnB
                    </Text>
                    <Text className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Conecte-se sua conta do SIGAA para visualizar suas turmas, horários e muito
                        mais.
                    </Text>
                    <Button
                        size="lg"
                        className="mt-4 self-start"
                        onPress={() => router.push('/login')}
                    >
                        <Text>Entrar com SIGAA</Text>
                        <Icon as={ArrowRight} className="text-primary-foreground" />
                    </Button>
                </View>
            </CardContent>
        </Card>
    );
}
