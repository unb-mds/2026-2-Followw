import { type Href, useRouter } from 'expo-router';
import { ArrowLeft, ChevronDown } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { FollowwLogo } from '@/components/FollowwLogo';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface HeaderBarProps {
    children?: React.ReactNode;
    // ações alinhadas à direita
    actions?: React.ReactNode;
    showLogo?: boolean;
}

/** Header das páginas do web: logo e título à esquerda, ações à direita; rola com o conteúdo. */
export function HeaderBar({ children, actions, showLogo = true }: HeaderBarProps) {
    return (
        <View className="mb-2 flex-row items-center justify-between pt-4 pb-2">
            <View className="shrink flex-row items-center gap-2">
                {showLogo && <FollowwLogo size={40} />}
                {children}
            </View>
            {actions && <View className="flex-row items-center gap-2">{actions}</View>}
        </View>
    );
}

export function HeaderTitle({ children }: { children: React.ReactNode }) {
    return (
        <Text
            role="heading"
            aria-level={1}
            className="text-xl leading-tight font-bold tracking-tight"
        >
            {children}
        </Text>
    );
}

interface HeaderToggleProps {
    children: React.ReactNode;
    open: boolean;
    onToggle: () => void;
    title: string;
}

export function HeaderToggle({ children, open, onToggle, title }: HeaderToggleProps) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityState={{ expanded: open }}
            onPress={onToggle}
            className="flex-row items-center gap-1 active:opacity-70"
        >
            <HeaderTitle>{children}</HeaderTitle>
            <Icon
                as={ChevronDown}
                className={cn('size-4 text-muted-foreground', open && 'rotate-180 text-primary')}
            />
        </Pressable>
    );
}

interface BackHeaderProps {
    // destino quando não há tela anterior (link aberto direto)
    to: Href;
    title: string;
    ariaLabel?: string;
    actions?: React.ReactNode;
}

export function BackHeader({ to, title, ariaLabel = 'Voltar', actions }: BackHeaderProps) {
    const router = useRouter();
    return (
        <HeaderBar showLogo={false} actions={actions}>
            <Button
                variant="ghost"
                size="icon"
                className="size-10"
                accessibilityLabel={ariaLabel}
                onPress={() => (router.canGoBack() ? router.back() : router.replace(to))}
            >
                <Icon as={ArrowLeft} className="size-5" />
            </Button>
            <HeaderTitle>{title}</HeaderTitle>
        </HeaderBar>
    );
}
