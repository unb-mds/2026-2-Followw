import { Check, ChevronDown } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, type PressableProps, ScrollView, View } from 'react-native';

import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    useDrawer
} from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface SelectItemData {
    value: string;
    label: string;
}

interface SelectContextValue {
    value: string | null | undefined;
    items: SelectItemData[];
    select: (value: string) => void;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelect() {
    const context = React.use(SelectContext);
    if (!context) throw new Error('useSelect must be used within a Select.');
    return context;
}

interface SelectProps {
    value?: string | null;
    onValueChange?: (value: string) => void;
    // rótulos para o SelectValue
    items?: SelectItemData[];
    children: React.ReactNode;
}

/** Select do web com a lista de opções num Drawer. */
function Select({ value, onValueChange, items = [], children }: SelectProps) {
    const [open, setOpen] = React.useState(false);
    const context = React.useMemo(
        () => ({
            value,
            items,
            select: (next: string) => {
                setOpen(false);
                if (next !== value) onValueChange?.(next);
            }
        }),
        [value, items, onValueChange]
    );
    return (
        <SelectContext value={context}>
            <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
                {children}
            </Drawer>
        </SelectContext>
    );
}

function SelectTrigger({
    className,
    children,
    size = 'default',
    disabled,
    ...props
}: PressableProps & { size?: 'sm' | 'default'; children?: React.ReactNode }) {
    const { setOpen, open } = useDrawer();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open, disabled: Boolean(disabled) }}
            disabled={disabled}
            onPress={() => setOpen(true)}
            className={cn(
                'flex-row items-center justify-between gap-1.5 self-start rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 active:bg-input/50 dark:bg-input/30',
                size === 'default' ? 'h-8' : 'h-7 rounded-md',
                disabled && 'opacity-50',
                className
            )}
            {...props}
        >
            {children}
            <Icon as={ChevronDown} className="size-4 text-muted-foreground" />
        </Pressable>
    );
}

function SelectValue({ className, placeholder }: { className?: string; placeholder?: string }) {
    const { value, items } = useSelect();
    const label = items.find((item) => item.value === value)?.label ?? value;
    return (
        <Text
            numberOfLines={1}
            className={cn('flex-1 text-left text-sm', !label && 'text-muted-foreground', className)}
        >
            {label || placeholder}
        </Text>
    );
}

function SelectContent({
    className,
    title,
    children
}: {
    className?: string;
    title?: string;
    children: React.ReactNode;
}) {
    return (
        <DrawerContent>
            {title && (
                <DrawerHeader>
                    <DrawerTitle>{title}</DrawerTitle>
                </DrawerHeader>
            )}
            <ScrollView
                accessibilityRole="list"
                contentContainerClassName={cn('p-2 pb-4', className)}
            >
                {children}
            </ScrollView>
        </DrawerContent>
    );
}

function SelectItem({
    value,
    className,
    children,
    disabled,
    ...props
}: Omit<PressableProps, 'children'> & { value: string; children: React.ReactNode }) {
    const { value: selected, select } = useSelect();
    const active = value === selected;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: Boolean(disabled) }}
            disabled={disabled}
            onPress={() => select(value)}
            className={cn(
                'flex-row items-center gap-1.5 rounded-md py-3 pr-8 pl-3 active:bg-accent',
                disabled && 'opacity-50',
                className
            )}
            {...props}
        >
            <Text className="flex-1 text-base">{children}</Text>
            {active && (
                <View className="absolute right-3">
                    <Icon as={Check} className="size-4" />
                </View>
            )}
        </Pressable>
    );
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof Text>) {
    return (
        <Text className={cn('px-3 py-1 text-xs text-muted-foreground', className)} {...props} />
    );
}

function SelectSeparator({ className }: { className?: string }) {
    return <View className={cn('-mx-1 my-1 h-px bg-border', className)} />;
}

export { Select, SelectContent, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue };
export type { SelectItemData };
