import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import {
  CircleCheck,
  Info,
  OctagonX,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated, { FadeOut, ReduceMotion, SlideInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ToastType = 'success' | 'info' | 'warning' | 'error' | 'loading';

type ToastOptions = {
  id?: string;
  title?: string;
  description?: string;
  type?: ToastType;
  timeout?: number;
};

type ToastItem = ToastOptions & { id: string };

const DEFAULT_TIMEOUT = 5000;

const ICONS: Partial<Record<ToastType, LucideIcon>> = {
  success: CircleCheck,
  info: Info,
  warning: TriangleAlert,
  error: OctagonX,
};

let items: ToastItem[] = [];
let counter = 0;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function close(id?: string) {
  const ids = id ? [id] : items.map((item) => item.id);
  ids.forEach((key) => {
    clearTimeout(timers.get(key));
    timers.delete(key);
  });
  items = items.filter((item) => !ids.includes(item.id));
  emit();
}

function add(options: ToastOptions) {
  const id = options.id ?? `toast-${++counter}`;
  clearTimeout(timers.get(id));
  items = [...items.filter((item) => item.id !== id), { ...options, id }];
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  if (timeout > 0 && options.type !== 'loading') timers.set(id, setTimeout(() => close(id), timeout));
  emit();
  return id;
}

const toast = { add, close };

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function useToasts() {
  return React.useSyncExternalStore(
    subscribe,
    () => items,
    () => items
  );
}

function ToastIcon({ type }: { type?: ToastType }) {
  if (type === 'loading') return <ActivityIndicator size="small" />;
  const IconComponent = type ? ICONS[type] : undefined;
  if (!IconComponent) return null;
  return (
    <Icon
      as={IconComponent}
      className={cn('size-4 shrink-0', type === 'error' ? 'text-destructive' : 'text-foreground')}
    />
  );
}

function Toast({ item }: { item: ToastItem }) {
  return (
    <Animated.View
      entering={SlideInUp.duration(300).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(200).reduceMotion(ReduceMotion.System)}
      role="alert"
      className="bg-popover border-border flex-row items-center gap-3 rounded-2xl border p-4 shadow-lg shadow-black/10">
      <ToastIcon type={item.type} />
      <View className="min-w-0 flex-1 gap-1">
        {item.title ? <Text className="text-popover-foreground text-sm font-medium">{item.title}</Text> : null}
        {item.description ? (
          <Text className="text-muted-foreground text-sm">{item.description}</Text>
        ) : null}
      </View>
      <Button
        variant="ghost"
        size="icon-sm"
        hitSlop={8}
        accessibilityLabel="Fechar aviso"
        onPress={() => close(item.id)}>
        <Icon as={X} className="text-muted-foreground size-4" />
      </Button>
    </Animated.View>
  );
}

function Toaster() {
  const toasts = useToasts();
  const insets = useSafeAreaInsets();
  if (toasts.length === 0) return null;
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 top-0 z-50 items-center gap-2 px-4"
      style={{ paddingTop: insets.top + 8 }}>
      {toasts.map((item) => (
        <View key={item.id} className="w-full max-w-sm">
          <Toast item={item} />
        </View>
      ))}
    </View>
  );
}

export { Toaster, toast };
export type { ToastOptions, ToastType };
