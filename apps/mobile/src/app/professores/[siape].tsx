import { titleCase } from '@followw/core/lib/profile.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { professorQueryOptions } from '@followw/core/queries/professors.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SearchX } from 'lucide-react-native';

import { OfflineBanner } from '@/components/OfflineBanner';
import { PageState } from '@/components/PageState';
import { ProfessorDetailsSection } from '@/components/professor/ProfessorDetailsSection';
import { ProfessorHeader } from '@/components/professor/ProfessorHeader';
import { QueryState } from '@/components/QueryState';
import { Screen } from '@/components/Screen';
import { ShareButton } from '@/components/ShareButton';

export { ErrorState as ErrorBoundary } from '@/components/ErrorState';

// mesmo limite do `Path` da API; fora dele o docente não existe
const MAX_SIAPE = 2 ** 31 - 1;

function parseSiape(value: string | undefined): number | null {
    const siape = value && /^\d+$/.test(value) ? Number(value) : 0;
    return siape > 0 && siape <= MAX_SIAPE ? siape : null;
}

export default function ProfessorScreen() {
    const { siape: param } = useLocalSearchParams<{ siape: string }>();
    const siape = parseSiape(param);
    const query = useQuery({ ...professorQueryOptions(siape ?? 0), enabled: siape !== null });
    const notFound = siape === null || (query.error instanceof ApiError && query.error.isNotFound);
    const professor = query.data;

    return (
        <Screen
            onRefreshData={(queryClient) =>
                siape === null
                    ? Promise.resolve()
                    : refreshQuery(queryClient, professorQueryOptions(siape))
            }
        >
            <Stack.Screen
                options={{
                    title: professor ? titleCase(professor.name) : 'Docente',
                    headerRight: professor
                        ? // oxlint-disable-next-line react/no-unstable-nested-components -- headerRight exige função
                          () => (
                              <ShareButton
                                  title={titleCase(professor.name)}
                                  path={`/professores/${professor.siape}`}
                              />
                          )
                        : undefined
                }}
            />
            <OfflineBanner />
            {notFound ? (
                <PageState
                    icon={SearchX}
                    title="Docente não encontrado"
                    message="Não existe um docente com esse SIAPE."
                />
            ) : (
                <QueryState
                    query={query}
                    loading="Carregando docente..."
                    error="Não foi possível carregar o docente."
                    stale="Não foi possível atualizar o docente."
                >
                    {(data) => (
                        <>
                            <ProfessorHeader professor={data} />
                            <ProfessorDetailsSection professor={data} />
                        </>
                    )}
                </QueryState>
            )}
        </Screen>
    );
}
