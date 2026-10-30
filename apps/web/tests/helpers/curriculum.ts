import type { CourseCurriculum, CurriculumSubject } from '#/queries/curriculum';

type Codes = string[][] | null;
export type RawSubject = Omit<
    CurriculumSubject,
    'prerequisites' | 'corequisites' | 'equivalences'
> & {
    prerequisites?: Codes;
    corequisites?: Codes;
    equivalences?: Codes;
};
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
    const subject = ({ prerequisites, corequisites, equivalences, ...data }: RawSubject) => ({
        ...data,
        prerequisites: named(prerequisites),
        corequisites: named(corequisites),
        equivalences: named(equivalences)
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
