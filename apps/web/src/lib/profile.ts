import type { components } from '#/queries/schema.gen';

type UserProfile = components['schemas']['UserProfile'];

const indexFormat = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
});

const LOWERCASE_WORDS = new Set(['a', 'as', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'o', 'os']);
const ROMAN_NUMERAL = /^[ivx]+$/;
// início de palavra, inclusive após hífen, apóstrofo, parêntese ou barra
const WORD_START = /(^|[-'’(/])(\p{L})/gu;

// o SIGAA devolve nomes e cursos em caixa alta
export function titleCase(text: string) {
    return text
        .toLocaleLowerCase('pt-BR')
        .split(/\s+/)
        .filter(Boolean)
        .map((word, index) => {
            if (index === 0) return capitalize(word);
            if (LOWERCASE_WORDS.has(word)) return word;
            if (ROMAN_NUMERAL.test(word)) return word.toLocaleUpperCase('pt-BR');
            return capitalize(word);
        })
        .join(' ');
}

function capitalize(word: string) {
    return word.replace(
        WORD_START,
        (_, start, letter) => start + letter.toLocaleUpperCase('pt-BR')
    );
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
