import type { components } from '#/queries/schema.gen';

type UserProfile = components['schemas']['UserProfile'];

const indexFormat = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
});

const HOURS_PER_CREDIT = 15;
const creditFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function creditsLabel(hours: number) {
    const credits = hours / HOURS_PER_CREDIT;
    return `${creditFormat.format(credits)} ${credits === 1 ? 'crédito' : 'créditos'}`;
}

const LOWERCASE_WORDS = new Set(['a', 'as', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'o', 'os']);
const ROMAN_NUMERAL = /^[ivx]+$/;
const SPECIAL_WORDS: Record<string, string> = { unb: 'UnB' };
// início de palavra, inclusive após hífen, apóstrofo, parêntese ou barra
const WORD_START = /(^|[-'’(/])(\p{L})/gu;

// o SIGAA devolve nomes e cursos em caixa alta
export function titleCase(text: string) {
    return text
        .toLocaleLowerCase('pt-BR')
        .split(/\s+/)
        .filter(Boolean)
        .map((word, index) => {
            if (word in SPECIAL_WORDS) return SPECIAL_WORDS[word];
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

// o SIGAA nomeia como "CAMPUS: FACULDADE - BRASÍLIA"; fica a sigla e o trecho antes de ":"
export function unitLabel(unit: { code?: string | null; name: string }): string {
    const name = titleCase(
        unit.name
            .split(':')[0]
            .replace(/\s*-\s*BRAS[IÍ]LIA/gi, '')
            .trim()
    );
    return unit.code ? `${unit.code} · ${name}` : name;
}
