import { createParser, createStandardSchemaV1 } from 'nuqs/server';

export const DEFAULT_LOGIN_RETURN = '/perfil';

export function safeLoginReturn(value: unknown): string {
    if (
        typeof value !== 'string' ||
        !value.startsWith('/') ||
        value.startsWith('//') ||
        Array.from(value).some(
            (char) => char === '\\' || char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127
        )
    )
        return DEFAULT_LOGIN_RETURN;
    const url = new URL(value, 'https://followw.invalid');
    let pathname: string;
    try {
        pathname = decodeURIComponent(url.pathname).replace(/\/+$/, '');
    } catch {
        return DEFAULT_LOGIN_RETURN;
    }
    if (
        url.origin !== 'https://followw.invalid' ||
        url.pathname.startsWith('//') ||
        pathname === '/login'
    )
        return DEFAULT_LOGIN_RETURN;
    return `${url.pathname}${url.search}${url.hash}`;
}

// Um retorno inseguro vira o padrão já na leitura da URL.
const parseAsLoginReturn = createParser({
    parse: safeLoginReturn,
    serialize: (value: string) => value
}).withDefault(DEFAULT_LOGIN_RETURN);

export const loginParsers = { returnTo: parseAsLoginReturn };
export const validateLoginSearch = createStandardSchemaV1(loginParsers, { partialOutput: true });
