import regular from '@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff?inline';
import bold from '@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff?inline';

export const restaurantImageFonts = [
    {
        name: 'DM Sans',
        data: Buffer.from(regular.split(',')[1], 'base64'),
        weight: 400 as const,
        style: 'normal' as const
    },
    {
        name: 'DM Sans',
        data: Buffer.from(bold.split(',')[1], 'base64'),
        weight: 700 as const,
        style: 'normal' as const
    }
];
