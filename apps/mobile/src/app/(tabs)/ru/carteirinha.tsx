import { documentRefusal } from '@followw/core/lib/documents.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { credentialsQueryOptions } from '@followw/core/queries/restaurant-account.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { QrCode } from 'lucide-react-native';
import { View } from 'react-native';

import { ErrorCard } from '@/components/ErrorState';
import { LoadingText } from '@/components/LoadingText';
import { PageState } from '@/components/PageState';
import { StudentCard } from '@/components/ru/StudentCard';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export { ErrorState as ErrorBoundary } from '@/components/ErrorState';

export default function StudentCardScreen() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const me = useQuery(meQueryOptions);
    const registration = me.data?.registration ?? '';
    const options = credentialsQueryOptions(registration);
    const credentials = useQuery({ ...options, enabled: Boolean(registration) });

    let content: React.ReactNode;
    if (me.isPending) content = <LoadingText>Carregando...</LoadingText>;
    else if (!me.data)
        content = (
            <PageState
                icon={QrCode}
                title="Entre com o SIGAA"
                message="Veja sua carteirinha do RU."
            >
                <Button onPress={() => router.replace('/login')}>
                    <Text>Entrar</Text>
                </Button>
            </PageState>
        );
    else if (credentials.data) content = <StudentCard credentials={credentials.data} />;
    else if (credentials.isError)
        content = (
            <ErrorCard
                message={
                    documentRefusal(credentials.error) ?? 'Não foi possível carregar a carteirinha.'
                }
                onRetry={() => void refreshQuery(queryClient, options, { retry: false })}
            />
        );
    else content = <LoadingText>Carregando carteirinha...</LoadingText>;

    return (
        <View className="flex-1 gap-4 bg-background p-6">
            <Text className="text-center text-xl font-bold">Carteirinha estudantil</Text>
            {content}
            <Button variant="outline" onPress={() => router.back()}>
                <Text>Fechar</Text>
            </Button>
        </View>
    );
}
