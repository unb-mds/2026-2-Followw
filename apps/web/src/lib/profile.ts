import type { components } from '#/queries/schema.gen';

type UserProfile = components['schemas']['UserProfile'];

const indexFormat = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
});

const LOWERCASE_WORDS = new Set(['a', 'as', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'o', 'os']);

// o SIGAA devolve nomes e cursos em caixa alta
export function titleCase(text: string) {
    return text
        .toLocaleLowerCase('pt-BR')
        .split(/\s+/)
        .filter(Boolean)
        .map((word, index) =>
            index > 0 && LOWERCASE_WORDS.has(word)
                ? word
                : word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1)
        )
        .join(' ');
}

export interface AcademicIndex {
    label: string;
    description: string;
    value: string;
}

export function academicIndexes(user: Pick<UserProfile, 'ira' | 'mp'>): AcademicIndex[] {
    const indexes = [
        { label: 'IRA', description: 'Índice de rendimento acadêmico', value: user.ira },
        { label: 'MP', description: 'Média ponderada', value: user.mp }
    ];
    return indexes.flatMap(({ value, ...index }) =>
        value == null ? [] : [{ ...index, value: indexFormat.format(value) }]
    );
}
