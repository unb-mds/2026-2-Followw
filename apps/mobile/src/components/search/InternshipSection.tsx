import type { InternshipItem } from '@followw/core/queries/internships.ts';

import { filterInternships, internshipsQueryOptions } from '@followw/core/queries/internships.ts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { QueryState } from '@/components/QueryState';
import { InternshipCard } from '@/components/search/InternshipCard';
import { InternshipDetailDialog } from '@/components/search/InternshipDetailDialog';
import { Text } from '@/components/ui/text';

const GROUPS = [
    { label: 'Seu curso', mine: true },
    { label: 'Outros cursos', mine: false }
];

function countLabel(count: number) {
    return `${count} ${count === 1 ? 'vaga' : 'vagas'}`;
}

export function InternshipSection({
    internships,
    emptyMessage
}: {
    internships: InternshipItem[];
    emptyMessage?: string;
}) {
    const [selected, setSelected] = useState<InternshipItem | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    if (internships.length === 0) {
        if (!emptyMessage) return null;
        return (
            <Text className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</Text>
        );
    }

    return (
        <View className="gap-4">
            {GROUPS.map(({ label, mine }) => {
                const visible = internships.filter((item) => item.is_my_course === mine);
                if (visible.length === 0) return null;
                return (
                    <View key={label} className="gap-2.5">
                        <View className="flex-row items-baseline gap-2">
                            <Text
                                role="heading"
                                aria-level={2}
                                className="text-base font-bold text-foreground"
                            >
                                {label}
                            </Text>
                            <Text className="text-xs text-muted-foreground">
                                {countLabel(visible.length)}
                            </Text>
                        </View>
                        {visible.map((internship) => (
                            <InternshipCard
                                key={internship.reference}
                                internship={internship}
                                onPress={() => {
                                    setSelected(internship);
                                    setDetailOpen(true);
                                }}
                            />
                        ))}
                    </View>
                );
            })}
            <InternshipDetailDialog
                summary={selected}
                open={detailOpen}
                onOpenChange={setDetailOpen}
            />
        </View>
    );
}

export function InternshipResults({ text }: { text: string | null }) {
    const query = useQuery(internshipsQueryOptions);
    return (
        <View aria-busy={query.isFetching} className="gap-5">
            <QueryState
                query={query}
                loading="Carregando ofertas de estágio..."
                error="Não foi possível carregar as ofertas de estágio."
                stale="Não foi possível atualizar as vagas. Exibindo os dados salvos."
                className="justify-center"
            >
                {(data) => (
                    <InternshipSection
                        internships={filterInternships(data, text)}
                        emptyMessage={
                            text
                                ? 'Nenhum estágio encontrado para esta busca.'
                                : 'Nenhuma oferta de estágio disponível no momento.'
                        }
                    />
                )}
            </QueryState>
        </View>
    );
}
