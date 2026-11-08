import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Image, type ImageSourcePropType, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FollowwLogo } from '@/components/FollowwLogo';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

const exterior: ImageSourcePropType = require('../../assets/images/not-found/icc-exterior.webp');
const corredor: ImageSourcePropType = require('../../assets/images/not-found/icc-corredor.webp');
const collage: ImageSourcePropType = require('../../assets/images/not-found/collage.webp');

export function NotFoundPage() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    return (
        <View className="flex-1 overflow-hidden bg-background">
            <Pressable
                accessibilityRole="link"
                accessibilityLabel="Followw — voltar ao início"
                onPress={() => router.replace('/')}
                style={{ top: insets.top + 24 }}
                className="absolute left-6 z-20 opacity-70 active:opacity-100"
            >
                <FollowwLogo size={40} />
            </Pressable>

            <View className="flex-1 items-center justify-center px-6 py-24">
                <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    pointerEvents="none"
                    className="relative aspect-[4/3] w-full"
                >
                    <Image
                        source={exterior}
                        accessibilityIgnoresInvertColors
                        resizeMode="cover"
                        className="absolute bottom-0 -left-16 h-3/5 w-3/5 -rotate-6 opacity-70"
                    />
                    <Image
                        source={corredor}
                        accessibilityIgnoresInvertColors
                        resizeMode="cover"
                        className="absolute top-6 -right-12 h-4/5 w-2/5 rotate-6 opacity-60"
                    />
                    <Image
                        source={collage}
                        accessibilityIgnoresInvertColors
                        resizeMode="contain"
                        className="relative z-10 size-full"
                    />
                </View>

                <View className="z-10 mt-6 max-w-xl items-center">
                    <Text
                        role="heading"
                        aria-level={1}
                        accessibilityLabel="404 — Essa página se perdeu."
                        className="text-center text-3xl font-bold tracking-tight"
                    >
                        Essa página se perdeu.
                    </Text>
                    <Text className="mt-3 text-center text-sm text-muted-foreground">
                        Vamos encontrar o caminho de volta.
                    </Text>
                    <Button
                        size="lg"
                        className="mt-6 h-12 gap-2 rounded-2xl px-8"
                        onPress={() => router.replace('/')}
                    >
                        <Icon as={ArrowLeft} className="size-4 text-primary-foreground" />
                        <Text>Voltar ao início</Text>
                    </Button>
                </View>
            </View>
        </View>
    );
}
