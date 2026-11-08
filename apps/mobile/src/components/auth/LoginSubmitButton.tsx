import { loginProgressAt } from '@followw/core/lib/login-progress.ts';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useColor } from '@/lib/colors';

interface LoginSubmitButtonProps {
    pending: boolean;
    onPress: () => void;
}

export function LoginSubmitButton({ pending, onPress }: LoginSubmitButtonProps) {
    const spinner = useColor('primary-foreground');
    return (
        <Button
            disabled={pending}
            aria-busy={pending}
            onPress={onPress}
            className="relative mt-4 h-12 w-full overflow-hidden rounded-full shadow-md shadow-black/10"
        >
            {pending ? (
                <>
                    <LoginProgressBar />
                    <View className="flex-row items-center gap-2">
                        <ActivityIndicator size="small" color={spinner} />
                        <Text className="font-bold">Entrando...</Text>
                    </View>
                </>
            ) : (
                <Text className="font-bold">Entrar</Text>
            )}
        </Button>
    );
}

function LoginProgressBar() {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const startedAt = Date.now();
        const interval = setInterval(
            () => setProgress(loginProgressAt(Date.now() - startedAt)),
            50
        );
        return () => clearInterval(interval);
    }, []);

    return (
        <View
            pointerEvents="none"
            className="absolute inset-y-0 left-0 bg-black/25"
            style={{ width: `${progress}%` }}
        />
    );
}
