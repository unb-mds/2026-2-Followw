import { ScrollView, type ScrollViewProps, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OfflineBanner } from '@/components/OfflineBanner';
import { type RefreshFn, usePullToRefresh } from '@/lib/pull-to-refresh';
import { cn } from '@/lib/utils';

interface ScreenProps extends ScrollViewProps {
    // HeaderBar/BackHeader da página, rola junto com o conteúdo como no web
    header?: React.ReactNode;
    // sem a barra de navegação inferior (login, curso)
    fullscreen?: boolean;
    // habilita o pull-to-refresh; veja `refreshQuery` do core
    onRefreshData?: RefreshFn;
}

/** Página rolável no layout do web: coluna de até 2xl, header, aviso de offline e espaço para a barra. */
export function Screen({
    header,
    fullscreen = false,
    onRefreshData,
    contentContainerClassName,
    children,
    ...props
}: ScreenProps) {
    const insets = useSafeAreaInsets();
    const refreshControl = usePullToRefresh(onRefreshData, insets.top);
    return (
        <View className="flex-1 bg-background">
            <ScrollView
                keyboardShouldPersistTaps="handled"
                refreshControl={refreshControl}
                className="flex-1"
                contentContainerStyle={{
                    paddingTop: insets.top,
                    paddingBottom: insets.bottom + (fullscreen ? 16 : 96)
                }}
                contentContainerClassName={cn(
                    'w-full max-w-2xl self-center px-4',
                    contentContainerClassName
                )}
                {...props}
            >
                {header}
                <OfflineBanner />
                {children}
            </ScrollView>
            <View
                pointerEvents="none"
                style={{ height: insets.top }}
                className="absolute inset-x-0 top-0 bg-background"
            />
        </View>
    );
}
