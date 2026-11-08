import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';

export default function NotFound() {
    return (
        <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
            <Stack.Screen options={{ title: 'Não encontrado' }} />
            <Text className="text-center text-lg font-semibold text-foreground">
                Essa página não existe.
            </Text>
            <Link href="/" className="font-medium text-primary">
                Voltar ao início
            </Link>
        </View>
    );
}
