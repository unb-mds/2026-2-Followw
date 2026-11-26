// chaves salvas no aparelho, iguais no web e no mobile
export const STORAGE_KEYS = {
    THEME: 'theme',
    SCHEDULE: 'schedule',
    SEEN_NEWS: 'seen-news',
    STUDENT_CARD: 'student-card',
    ACADEMIC_SIMULATION: 'academic-simulation'
} as const;

/** Dados da conta, apagados ao trocar de sessão. */
export const ACCOUNT_KEYS: readonly string[] = [
    STORAGE_KEYS.SCHEDULE,
    STORAGE_KEYS.SEEN_NEWS,
    STORAGE_KEYS.STUDENT_CARD,
    STORAGE_KEYS.ACADEMIC_SIMULATION
];
