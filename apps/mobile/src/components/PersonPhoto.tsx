import { UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Image, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

const WIDTHS = { sm: 'w-9', lg: 'w-20', xl: 'w-28' };

/** Foto 3x4 da pessoa, com ícone quando não há foto ou ela falha ao carregar. */
export function PersonPhoto({
    src,
    size = 'sm'
}: {
    src?: string | null;
    size?: keyof typeof WIDTHS;
}) {
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const className = cn('aspect-[3/4] shrink-0 overflow-hidden rounded-lg', WIDTHS[size]);

    if (src && failedSrc !== src) {
        return (
            <View
                className={cn(
                    className,
                    'bg-muted',
                    size !== 'sm' && 'border border-foreground/10'
                )}
            >
                <Image
                    source={{ uri: src }}
                    accessibilityIgnoresInvertColors
                    className="size-full"
                    resizeMode="cover"
                    onError={() => setFailedSrc(src)}
                />
            </View>
        );
    }
    return (
        <View className={cn(className, 'items-center justify-center bg-primary/10')}>
            <Icon
                as={UserRound}
                className={cn('text-primary', size === 'sm' ? 'size-4' : 'size-8')}
            />
        </View>
    );
}
