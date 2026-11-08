import { useFailureMessage } from '@followw/core/lib/online.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { CloudOff } from 'lucide-react-native';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export const SIGAA_DOWN_MESSAGE = 'O SIGAA está com problemas. Tente novamente em instantes.';

interface ErrorCardProps {
    // sem conexão, dá lugar ao aviso de offline
    message: string;
    onRetry: () => void;
}

export function ErrorCard({ message, onRetry }: ErrorCardProps) {
    const failureMessage = useFailureMessage(message);
    return (
        <Card className="items-center">
            <CardContent className="items-center gap-2">
                <Icon as={CloudOff} className="size-8 text-muted-foreground" />
                <Text role="alert" className="text-center text-sm font-semibold">
                    {failureMessage}
                </Text>
                <Button onPress={onRetry} className="mt-2">
                    <Text>Tentar novamente</Text>
                </Button>
            </CardContent>
        </Card>
    );
}

// falha ao revalidar algo que ainda tem dado salvo para exibir
export function StaleDataNotice({ subject, className }: { subject: string; className?: string }) {
    return (
        <Text className={cn('text-sm text-muted-foreground', className)}>
            Não foi possível atualizar {subject}. Exibindo os dados salvos.
        </Text>
    );
}

/** Tela de erro do Expo Router (`export { ErrorState as ErrorBoundary }`). */
export function ErrorState({ error, retry }: { error: Error; retry: () => Promise<unknown> }) {
    const message =
        error instanceof ApiError && error.isServerError
            ? SIGAA_DOWN_MESSAGE
            : 'Erro inesperado ao carregar os dados.';
    return (
        <View className="flex-1 justify-center bg-background p-4">
            <ErrorCard message={message} onRetry={() => void retry()} />
        </View>
    );
}
