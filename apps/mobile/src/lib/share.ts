import { Platform, Share } from 'react-native';

export const WEB_ORIGIN = 'https://followw.app';

/** Link público no site para o caminho informado. */
export function webUrl(path: string): string {
    return new URL(path, WEB_ORIGIN).href;
}

/** No Android o link vai junto da mensagem; no iOS ele é um campo à parte. */
export function shareContent(title: string, url: string, text?: string) {
    if (Platform.OS === 'ios') return { title, message: text ?? title, url };
    return { title, message: [text ?? title, url].join('\n') };
}

/** Abre a folha de compartilhamento do sistema; fechar a folha não é erro. */
export async function share(title: string, path: string, text?: string) {
    try {
        await Share.share(shareContent(title, webUrl(path), text));
    } catch {
        // sem suporte (web de desenvolvimento) ou erro da folha do sistema
    }
}
