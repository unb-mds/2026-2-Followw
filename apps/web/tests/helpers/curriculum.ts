import type { CourseCurriculum, CurriculumSubject } from '#/queries/curriculum';

type Codes = string[][] | null;
const REQUIREMENTS = [
    'prerequisites',
    'corequisites',
    'equivalences',
    'curriculum_prerequisites',
    'curriculum_corequisites',
    'offered_equivalences'
] as const;
export type RawSubject = Omit<CurriculumSubject, (typeof REQUIREMENTS)[number]> &
    Partial<Record<(typeof REQUIREMENTS)[number], Codes>>;
export interface RawCurriculum extends Omit<
    CourseCurriculum,
    'periods' | 'complementary' | 'degree' | 'modality'
> {
    periods: { period: number; subjects: RawSubject[] }[];
    complementary?: RawSubject[];
    degree?: string | null;
    modality?: string | null;
}

/** Resposta da API com requisitos por código, nomeados pelas matérias da matriz e por `names`. */
export function curriculum(
    { periods, complementary = [], ...rest }: RawCurriculum,
    names: Record<string, string> = {}
): CourseCurriculum {
    const catalog = new Map([
        ...[...periods.flatMap((block) => block.subjects), ...complementary].flatMap((item) =>
            item.name ? [[item.code, item.name] as const] : []
        ),
        ...Object.entries(names)
    ]);
    const named = (groups: Codes | undefined) =>
        groups == null
            ? groups
            : groups.map((group) =>
                  group.map((code) => {
                      const name = catalog.get(code);
                      return { code, subject: name === undefined ? null : { code, name } };
                  })
              );
    const subject = (item: RawSubject): CurriculumSubject => ({
        ...item,
        prerequisites: named(item.prerequisites),
        corequisites: named(item.corequisites),
        equivalences: named(item.equivalences),
        curriculum_prerequisites: named(item.curriculum_prerequisites),
        curriculum_corequisites: named(item.curriculum_corequisites),
        offered_equivalences: named(item.offered_equivalences)
    });
    return {
        degree: null,
        modality: null,
        ...rest,
        periods: periods.map(({ period, subjects }) => ({
            period,
            subjects: subjects.map(subject)
        })),
        complementary: complementary.map(subject)
    };
}
