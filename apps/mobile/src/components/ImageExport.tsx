import * as Sharing from 'expo-sharing';
import { type ReactNode, useEffect, useEffectEvent, useRef } from 'react';
import { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/** Renderiza `children` fora da tela, captura como PNG e abre o share sheet. */
export function ImageExport({
    width,
    title,
    onDone,
    children
}: {
    width: number;
    title: string;
    // `failed` quando não foi possível gerar ou compartilhar
    onDone: (failed: boolean) => void;
    children: ReactNode;
}) {
    const ref = useRef<React.ComponentRef<typeof View>>(null);
    const share = useEffectEvent(async () => {
        const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
        if (!(await Sharing.isAvailableAsync())) throw new Error('indisponível');
        await Sharing.shareAsync(uri.startsWith('file:') ? uri : `file://${uri}`, {
            mimeType: 'image/png',
            UTI: 'public.png',
            dialogTitle: title
        });
    });
    const finish = useEffectEvent(onDone);
    // dispara uma vez por exportação, depois de a imagem montar fora da tela
    useEffect(() => {
        let active = true;
        const timer = setTimeout(async () => {
            let failed = false;
            try {
                await share();
            } catch {
                failed = true;
            }
            if (active) finish(failed);
        }, 150);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, []);

    return (
        <View
            ref={ref}
            collapsable={false}
            pointerEvents="none"
            style={{ position: 'absolute', left: -width * 2, top: 0, width }}
        >
            {children}
        </View>
    );
}
