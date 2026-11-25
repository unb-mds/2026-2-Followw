import { type Href, usePathname, useRouter } from 'expo-router';
import {
    House,
    type LucideIcon,
    Search,
    User,
    UserRoundGroup,
    Utensils
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { snappy, spring } from '@/lib/motion';
import { activeNavIndex, NAV_HREFS, restaurantTabHref, showsNavigation } from '@/lib/navigation';
import { cn } from '@/lib/utils';

interface NavItem {
    href: (typeof NAV_HREFS)[number];
    label: string;
    icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
    { href: '/', label: 'Início', icon: House },
    { href: '/turmas', label: 'Turmas', icon: UserRoundGroup },
    { href: '/ru', label: 'RU', icon: Utensils },
    { href: '/buscar', label: 'Buscar', icon: Search },
    { href: '/perfil', label: 'Perfil', icon: User }
];

function useKeyboardVisible() {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
        const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
        return () => {
            show.remove();
            hide.remove();
        };
    }, []);
    return visible;
}

/** Barra flutuante do web, sobre todas as telas com navegação. */
export function BottomNavigation() {
    const pathname = usePathname();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const keyboardVisible = useKeyboardVisible();
    const [itemWidth, setItemWidth] = useState(0);
    const activeIndex = activeNavIndex(pathname);

    const position = useSharedValue(Math.max(activeIndex, 0));
    useEffect(() => {
        position.value = withSpring(Math.max(activeIndex, 0), spring);
    }, [activeIndex, position]);
    const indicatorStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: position.value * itemWidth }]
    }));

    if (!showsNavigation(pathname) || keyboardVisible) return null;

    const go = (href: Href) => {
        if (href !== pathname) router.navigate(href);
    };
    const onRestaurantPress = () => {
        const href = restaurantTabHref(pathname);
        if (typeof href === 'string') go(href);
        else router.navigate(href);
    };

    return (
        <View
            pointerEvents="box-none"
            style={{ bottom: insets.bottom + 20 }}
            className="absolute inset-x-0 items-center px-4"
        >
            <View
                accessibilityRole="tablist"
                accessibilityLabel="Navegação principal do aplicativo"
                className="w-80 max-w-full rounded-full border border-border bg-card/95 px-1 py-1.5 shadow-lg"
            >
                <View
                    className="h-11 flex-row"
                    onLayout={(event) => setItemWidth(event.nativeEvent.layout.width / 5)}
                >
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            indicatorStyle,
                            { width: itemWidth, opacity: activeIndex === -1 ? 0 : 1 }
                        ]}
                        className="absolute inset-y-0 left-0 px-1"
                    >
                        <View className="h-full rounded-full bg-primary/10" />
                    </Animated.View>
                    {NAV_ITEMS.map((item, index) => {
                        const active = index === activeIndex;
                        return (
                            <Pressable
                                key={item.href}
                                accessibilityRole="tab"
                                accessibilityLabel={item.label}
                                accessibilityState={{ selected: active }}
                                onPress={
                                    item.href === '/ru' ? onRestaurantPress : () => go(item.href)
                                }
                                className="flex-1 items-center justify-center rounded-full active:scale-90"
                            >
                                <NavIcon icon={item.icon} active={active} />
                            </Pressable>
                        );
                    })}
                </View>
            </View>
        </View>
    );
}

function NavIcon({ icon, active }: { icon: LucideIcon; active: boolean }) {
    const scale = useSharedValue(active ? 1.1 : 1);
    useEffect(() => {
        scale.value = withSpring(active ? 1.1 : 1, snappy);
    }, [active, scale]);
    const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
    return (
        <Animated.View style={style}>
            <Icon
                as={icon}
                strokeWidth={active ? 2.5 : 2}
                className={cn('size-5', active ? 'text-primary' : 'text-muted-foreground')}
            />
        </Animated.View>
    );
}
