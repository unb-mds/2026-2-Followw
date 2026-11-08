import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Children, Fragment, isValidElement } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Progress } from '@/components/ui/progress';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/** Card que separa os filhos com divisórias; use `ListRow` para linhas tocáveis. */
export function ListCard({
    className,
    children
}: {
    className?: string;
    children: React.ReactNode;
}) {
    const items = Children.toArray(children);
    return (
        <Card className={cn('gap-0 overflow-hidden py-0', className)}>
            {items.map((child, index) => (
                <Fragment key={isValidElement(child) ? child.key : null}>
                    {index > 0 && <View className="h-px bg-border" />}
                    {child}
                </Fragment>
            ))}
        </Card>
    );
}

export function ListChevron() {
    return <Icon as={ChevronRight} className="text-muted-foreground" />;
}

interface ListRowProps {
    icon?: LucideIcon;
    title: string;
    subtitle?: string;
    subtitleTone?: 'muted' | 'destructive';
    destructive?: boolean;
    disabled?: boolean;
    // ex.: ActivityIndicator; linhas que abrem outra tela usam `ListChevron`
    trailing?: React.ReactNode;
    onPress?: () => void;
}

export function ListRow({
    icon,
    title,
    subtitle,
    subtitleTone = 'muted',
    destructive,
    disabled,
    trailing,
    onPress
}: ListRowProps) {
    return (
        <Button
            variant="ghost"
            disabled={disabled || !onPress}
            onPress={onPress}
            className={cn(
                'h-auto min-h-14 justify-start gap-3 rounded-none px-3 py-2.5',
                !onPress && 'opacity-100'
            )}
        >
            {icon && (
                <View
                    className={cn(
                        'size-8 items-center justify-center rounded-lg',
                        destructive ? 'bg-destructive/10' : 'bg-primary/10'
                    )}
                >
                    <Icon
                        as={icon}
                        className={cn('size-4', destructive ? 'text-destructive' : 'text-primary')}
                    />
                </View>
            )}
            <View className="min-w-0 flex-1">
                <Text
                    className={cn('text-base font-normal', destructive && 'text-destructive')}
                    numberOfLines={1}
                >
                    {title}
                </Text>
                {subtitle && (
                    <Text
                        className={cn(
                            'text-xs font-normal',
                            subtitleTone === 'destructive'
                                ? 'text-destructive'
                                : 'text-muted-foreground'
                        )}
                    >
                        {subtitle}
                    </Text>
                )}
            </View>
            {trailing}
        </Button>
    );
}

export function Meter({
    label,
    value,
    detail,
    className
}: {
    label: string;
    value: number;
    detail?: string;
    className?: string;
}) {
    return (
        <View className={cn('px-3 py-3', className)}>
            <View className="flex-row items-baseline justify-between gap-2">
                <Text className="text-sm font-medium">{label}</Text>
                <Text className="text-sm font-semibold text-primary">
                    {value.toLocaleString('pt-BR')}%
                </Text>
            </View>
            <Progress
                className="mt-2"
                value={Math.min(100, Math.max(0, value))}
                indicatorClassName="bg-primary"
                aria-label={label}
            />
            {detail && <Text className="mt-1.5 text-xs text-muted-foreground">{detail}</Text>}
        </View>
    );
}
