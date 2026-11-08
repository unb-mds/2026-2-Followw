import { restaurantSharePath, type RestaurantSelection } from '@followw/core/lib/restaurant.ts';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { webUrl } from '@/lib/share';

/** Baixa a imagem do cardápio gerada pelo site e abre a folha de compartilhamento. */
export async function shareMenuImage(selection: RestaurantSelection) {
    const destination = new File(
        Paths.cache,
        `cardapio-ru-${selection.date}-${selection.meal}.png`
    );
    const file = await File.downloadFileAsync(
        webUrl(restaurantSharePath(selection, '/share/ru.png')),
        destination,
        { idempotent: true }
    );
    if (!(await Sharing.isAvailableAsync())) throw new Error('Compartilhamento indisponível.');
    await Sharing.shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png' });
}
