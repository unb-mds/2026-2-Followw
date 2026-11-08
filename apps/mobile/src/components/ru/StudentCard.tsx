import type { RestaurantCredentials } from '@followw/core/queries/restaurant-account.ts';

import { cardIsExpired } from '@followw/core/lib/restaurant.ts';
import { nowInBrasilia } from '@followw/core/lib/schedule.ts';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Text } from '@/components/ui/text';

const validity = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric'
});

/** QR da carteirinha: fundo branco fixo para leitura em qualquer tema. */
export function StudentCard({ credentials }: { credentials: RestaurantCredentials }) {
    const expired = cardIsExpired(credentials.valid_until, nowInBrasilia().date);
    return (
        <View className="items-center gap-2">
            {expired ? (
                <Text className="text-center text-sm font-semibold text-destructive">
                    Carteirinha vencida. Atualize para consultar uma nova carteirinha no SIGAA.
                </Text>
            ) : (
                <>
                    <View
                        accessibilityLabel="QR code da carteirinha estudantil"
                        className="rounded-xl bg-white p-3"
                    >
                        <QRCode
                            value={credentials.token}
                            size={240}
                            ecl="M"
                            color="#000000"
                            backgroundColor="#ffffff"
                        />
                    </View>
                    <Text className="text-center text-sm text-muted-foreground">
                        Apresente este QR code na entrada do RU.
                    </Text>
                </>
            )}
            <Text className="text-xs font-bold text-muted-foreground">
                Validade: {validity.format(new Date(`${credentials.valid_until}T00:00:00Z`))}
            </Text>
        </View>
    );
}
