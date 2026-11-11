import type { components } from '#/queries/schema.gen';

type UserProfile = components['schemas']['UserProfile'];
type Classroom = components['schemas']['ParticipantClassroom'];

export const MAX_PROFILE_BIO_LENGTH = 1024;

export function truncateProfileBio(text: string) {
    if (text.length <= MAX_PROFILE_BIO_LENGTH) return text;
    return Array.from(text).slice(0, MAX_PROFILE_BIO_LENGTH).join('');
}

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

export function curriculumProgress(workload: UserProfile['workload']) {
    if (!workload) return null;
    const { total, pending_mandatory, pending_optional, pending_complementary } = workload;
    const values = [total, pending_mandatory, pending_optional, pending_complementary];
    const pending = pending_mandatory + pending_optional + pending_complementary;
    if (values.some((hours) => !Number.isFinite(hours) || hours < 0) || pending > total)
        return null;
    return { total, pending, completed: total - pending };
}

export function projectedIntegralization(
    user: Pick<UserProfile, 'integralization' | 'workload'>,
    classrooms: readonly Classroom[]
) {
    const progress = curriculumProgress(user.workload);
    const completed = user.integralization;
    if (!progress?.total || completed == null || !Number.isFinite(completed)) return null;

    const subjects = new Set<string>();
    let hours = 0;
    for (const classroom of classrooms) {
        const { code, hours: workload } = classroom.subject;
        if (
            !classroom.current ||
            (classroom.status != null && classroom.status !== 'cursando') ||
            workload == null ||
            !Number.isFinite(workload) ||
            workload <= 0 ||
            subjects.has(code)
        )
            continue;
        subjects.add(code);
        hours += workload;
    }
    if (hours === 0) return null;
    const current = Math.max(0, Math.min(100, completed));
    const projected = Math.min(100, ((progress.completed + hours) / progress.total) * 100);
    return projected > current ? projected : null;
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
