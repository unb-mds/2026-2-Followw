import { createStandardSchemaV1, parseAsString } from 'nuqs/server';

export const loginParsers = { returnTo: parseAsString };
export const validateLoginSearch = createStandardSchemaV1(loginParsers, { partialOutput: true });

export function safeLoginReturn(value: unknown): string {
    if (
        typeof value !== 'string' ||
        !value.startsWith('/') ||
        value.startsWith('//') ||
        Array.from(value).some(
            (char) => char === '\\' || char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127
        )
    )
        return '/perfil';
    const url = new URL(value, 'https://followw.invalid');
    let pathname: string;
    try {
        pathname = decodeURIComponent(url.pathname).replace(/\/+$/, '');
    } catch {
        return '/perfil';
    }
    if (
        url.origin !== 'https://followw.invalid' ||
        url.pathname.startsWith('//') ||
        pathname === '/login'
    )
        return '/perfil';
    return `${url.pathname}${url.search}${url.hash}`;
}
