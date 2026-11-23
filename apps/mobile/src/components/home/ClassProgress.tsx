import { View } from 'react-native';

import { cn } from '@/lib/utils';

/** Trecho do trace do dia que enche com o andamento da aula; vermelho se houve falta. */
export function ClassProgress({ progress, absent }: { progress: number; absent: boolean }) {
    return (
        <View className="w-0.5 shrink-0 bg-muted">
            {/* absoluto: no Yoga, altura em % no fluxo estica a linha até a altura da tela */}
            <View
                className={cn('absolute inset-x-0 top-0', absent ? 'bg-destructive' : 'bg-primary')}
                style={{ height: `${Math.round(progress * 100)}%` }}
            />
        </View>
    );
}
