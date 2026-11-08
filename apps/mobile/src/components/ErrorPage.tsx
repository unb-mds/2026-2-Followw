import { ApiError } from '@followw/core/queries/errors.ts';
import { RefreshCw } from 'lucide-react-native';
import { View } from 'react-native';

import { FollowwLogo } from '@/components/FollowwLogo';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

interface ErrorPageProps {
    error?: Error;
    message?: string;
    onRetry: () => void;
}

/** Erro de tela inteira (falha ao iniciar), com a mesma composição do web. */
export function ErrorPage({ error, message, onRetry }: ErrorPageProps) {
    const resolvedMessage =
        message ??
        (error instanceof ApiError && error.isServerError
            ? 'O SIGAA ou nossos servidores estão com problemas. Tente novamente em instantes.'
            : 'Não foi possível carregar as informações. Verifique sua conexão e tente novamente.');

    return (
        <View className="flex-1 items-center justify-center bg-background px-6">
            <View className="w-full max-w-sm items-center">
                <FollowwLogo size={64} />
                <Text
                    role="heading"
                    aria-level={1}
                    className="mt-6 text-center text-2xl font-bold tracking-tight"
                >
                    Estamos com problemas no momento
                </Text>
                <Text className="mt-2 text-center text-sm text-muted-foreground">
                    {resolvedMessage}
                </Text>
                <Button size="lg" onPress={onRetry} className="mt-6 w-full gap-2">
                    <Icon as={RefreshCw} className="size-4 text-primary-foreground" />
                    <Text>Tentar novamente</Text>
                </Button>
            </View>
        </View>
    );
}
