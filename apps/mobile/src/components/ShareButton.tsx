import { Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useColor } from '@/lib/colors';
import { share } from '@/lib/share';

interface ShareButtonProps {
    title: string;
    // caminho no site (ex.: `/cursos/12`), vira link público
    path: string;
    text?: string;
    // compartilhamento próprio (ex.: imagem); o padrão é o link
    onShare?: () => Promise<void>;
}

export function ShareButton({ title, path, text, onShare }: ShareButtonProps) {
    const [sharing, setSharing] = useState(false);
    const muted = useColor('muted-foreground');

    const press = async () => {
        setSharing(true);
        try {
            await (onShare ? onShare() : share(title, path, text));
        } finally {
            setSharing(false);
        }
    };

    return (
        <Button
            variant="ghost"
            size="icon-lg"
            accessibilityLabel="Compartilhar"
            disabled={sharing}
            onPress={() => void press()}
        >
            {sharing ? (
                <ActivityIndicator color={muted} />
            ) : (
                <Icon as={Share2} className="size-5" />
            )}
        </Button>
    );
}
