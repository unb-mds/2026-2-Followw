import { Share2 } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { share } from '@/lib/share';

interface ShareButtonProps {
    title: string;
    // caminho no site (ex.: `/cursos/12`), vira link público
    path: string;
    text?: string;
}

/** Abre o share sheet nativo; use em `headerRight` (`<Stack.Screen options={{ headerRight }} />`). */
export function ShareButton({ title, path, text }: ShareButtonProps) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Compartilhar"
            hitSlop={8}
            onPress={() => void share(title, path, text)}
            className="size-9 items-center justify-center active:opacity-60"
        >
            <Icon as={Share2} className="size-5 text-primary" />
        </Pressable>
    );
}
