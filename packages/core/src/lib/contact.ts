export const EMAILS = {
    contact: 'contato@followw.app',
    bugs: 'bugs@followw.app',
    removal: 'removal@followw.app'
} as const;

export const mailto = (email: string) => `mailto:${email}`;
