import type { CurriculumSubject } from '@followw/core/queries/curriculum.ts';
import type { UserProfile } from '@followw/core/queries/me.ts';

import { titleCase } from '@followw/core/lib/profile.ts';
import { searchEmptyMessages, searchTypes } from '@followw/core/lib/search-categories.ts';
import { curriculumQueryOptions } from '@followw/core/queries/curriculum.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { searchQueryOptions } from '@followw/core/queries/search.ts';
import { withoutTakenSubjects } from '@followw/core/queries/subjects.ts';
import { noop, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { QueryState } from '#/components/QueryState';
import { TurmaSection } from '#/components/search/TurmaSection';
import { refreshQuery } from '#/queries/refresh';

const lookupKey = (text: string) => text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');

function ElectiveList({ subjects, text }: { subjects: CurriculumSubject[]; text: string | null }) {
    const terms = lookupKey(text ?? '')
        .split(/\s+/)
        .filter(Boolean);
    const matches = terms.length
        ? subjects.filter(({ code, name }) => {
              const key = lookupKey(`${code} ${name ?? ''}`);
              return terms.every((term) => key.includes(term));
          })
        : subjects;

    if (!matches.length) {
        return (
            <p className="py-8 text-center text-sm text-muted-foreground">
                {text ? searchEmptyMessages.electives : 'Nenhuma optativa pendente nesta matriz.'}
            </p>
        );
    }

    return (
        <TurmaSection
            title="Optativas do seu curso"
            subjects={matches.map(({ code, name }) => ({
                code,
                name: name ? titleCase(name) : code,
                kind: 'optional',
                classrooms: []
            }))}
            deferClassrooms
        />
    );
}

function ElectiveScheduleResults({
    subjects,
    text
}: {
    subjects: CurriculumSubject[];
    text: string;
}) {
    const client = useQueryClient();
    const options = searchQueryOptions(text, searchTypes.classrooms);
    const query = useQuery(options);

    return (
        <QueryState
            query={query}
            loading="Buscando turmas de optativas..."
            error="Não foi possível buscar as turmas de optativas."
            stale="Não foi possível atualizar a busca. Exibindo os dados salvos."
        >
            {({ subjects: results }) => {
                const byCode = new Map(results?.map((subject) => [subject.code, subject]));
                const matching = subjects.flatMap(({ code }) => {
                    const subject = byCode.get(code);
                    return subject?.classrooms.length
                        ? [
                              {
                                  ...subject,
                                  name: titleCase(subject.name),
                                  kind: 'optional' as const,
                                  curriculum_period: null
                              }
                          ]
                        : [];
                });
                return matching.length ? (
                    <TurmaSection
                        title="Optativas do seu curso"
                        subjects={matching}
                        onOpenDetails={() => void refreshQuery(client, options).catch(noop)}
                    />
                ) : (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                        Nenhuma turma de optativa corresponde ao horário pesquisado.
                    </p>
                );
            }}
        </QueryState>
    );
}

function CourseElectives({
    courseId,
    entrySemester,
    text,
    schedule,
    taken
}: {
    courseId: number;
    entrySemester: string;
    text: string | null;
    schedule: boolean;
    taken: ReadonlySet<string> | null;
}) {
    const query = useQuery(curriculumQueryOptions(courseId, entrySemester));
    return (
        <div aria-busy={query.isFetching}>
            <QueryState
                query={query}
                loading="Carregando optativas..."
                error={
                    query.error instanceof ApiError && query.error.isNotFound
                        ? 'Nenhuma matriz disponível para este curso e semestre de ingresso.'
                        : 'Não foi possível carregar as optativas.'
                }
                stale="Não foi possível atualizar as optativas. Exibindo os dados salvos."
                className="justify-center"
            >
                {(matrix) => {
                    const subjects = withoutTakenSubjects(
                        matrix.periods.find(({ period }) => period === 0)?.subjects ?? [],
                        taken
                    );
                    return schedule && text ? (
                        <ElectiveScheduleResults key={text} subjects={subjects} text={text} />
                    ) : (
                        <ElectiveList key={text ?? ''} subjects={subjects} text={text} />
                    );
                }}
            </QueryState>
        </div>
    );
}

export function ElectiveResults({
    user,
    text,
    schedule,
    taken
}: {
    user: UserProfile | null;
    text: string | null;
    schedule: boolean;
    taken: ReadonlySet<string> | null;
}) {
    if (!user) {
        return (
            <p className="text-sm text-muted-foreground">
                <Link className="font-bold text-primary hover:underline" to="/login">
                    Entre na sua conta
                </Link>{' '}
                para ver as optativas do seu curso.
            </p>
        );
    }
    if (!user.course || !user.entry_semester) {
        return (
            <p className="py-8 text-center text-sm text-muted-foreground">
                Seu perfil precisa ter curso e semestre de ingresso para identificar as optativas.
            </p>
        );
    }
    return (
        <CourseElectives
            courseId={user.course.id}
            entrySemester={user.entry_semester}
            text={text}
            schedule={schedule}
            taken={taken}
        />
    );
}
