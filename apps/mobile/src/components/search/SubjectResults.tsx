import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { subjectsQueryOptions, withClassrooms } from '@followw/core/queries/subjects.ts';
import { keepPreviousData, noop, useQuery, useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';

import { QueryState } from '@/components/QueryState';
import { TurmaSection } from '@/components/search/TurmaSection';
import { Text } from '@/components/ui/text';

/** Matérias da unidade, listadas sem texto de busca. */
export function SubjectResults({
    unit,
    currentPeriod,
    taken
}: {
    unit: string;
    currentPeriod: number | null;
    taken: Set<string> | null;
}) {
    const client = useQueryClient();
    const options = subjectsQueryOptions({ unit });
    const result = useQuery({ ...options, placeholderData: keepPreviousData });
    const refresh = () => void refreshQuery(client, options).catch(noop);
    return (
        <View className="gap-5">
            <QueryState
                query={result}
                loading="Buscando matérias..."
                error="Não foi possível buscar as matérias."
                stale="Não foi possível atualizar as matérias. Exibindo os dados salvos."
                className="justify-center"
            >
                {(data) => {
                    const subjects = withClassrooms(data);
                    return (
                        <>
                            <TurmaSection
                                key={unit}
                                title={`Matérias da ${unit}`}
                                subjects={subjects}
                                currentPeriod={currentPeriod}
                                taken={taken}
                                onOpenDetails={refresh}
                            />
                            {subjects.length === 0 && (
                                <Text className="py-8 text-center text-sm text-muted-foreground">
                                    Nenhuma matéria encontrada. Tente mudar a busca.
                                </Text>
                            )}
                        </>
                    );
                }}
            </QueryState>
        </View>
    );
}
