import { Fragment, type ReactNode } from 'react';
import { View } from 'react-native';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Esboço do resultado; leitores de tela ouvem apenas o rótulo. */
export function LoadingSkeleton({
    label,
    className,
    children
}: {
    label: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={label}
            className={cn('flex-col gap-3', className)}
        >
            {children}
        </View>
    );
}

export const repeat = (count: number, render: (index: number) => ReactNode) =>
    Array.from({ length: count }, (_, index) => <Fragment key={index}>{render(index)}</Fragment>);

/** Título e contagem de uma seção de resultados. */
export function SectionHeaderSkeleton({ className }: { className?: string }) {
    return (
        <View className={cn('flex-row items-center justify-between gap-3', className)}>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-16" />
        </View>
    );
}

/** Linhas de texto empilhadas; cada item é a classe de largura/altura da linha. */
export function LinesSkeleton({ lines, className }: { lines: string[]; className?: string }) {
    return (
        <View className={cn('min-w-0 shrink grow flex-col gap-2', className)}>
            {repeat(lines.length, (index) => (
                <Skeleton className={cn('h-4', lines[index])} />
            ))}
        </View>
    );
}

/** Cartão de lista; `media` reserva o ícone ou a foto à esquerda. */
const CARD_LINES = ['h-3 w-1/4', 'w-3/4'];

export function CardSkeleton({
    lines = CARD_LINES,
    media,
    className
}: {
    lines?: string[];
    media?: string;
    className?: string;
}) {
    return (
        <View
            className={cn(
                'flex-row items-center gap-3 rounded-2xl border border-foreground/10 bg-card p-4',
                className
            )}
        >
            {media && <Skeleton className={cn('shrink-0', media)} />}
            <LinesSkeleton lines={lines} />
        </View>
    );
}
