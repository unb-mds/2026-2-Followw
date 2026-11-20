import type { InternshipItem } from '@followw/core/queries/internships.ts';

import { filterInternships, internshipsQueryOptions } from '@followw/core/queries/internships.ts';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { QueryState } from '@/components/QueryState';
import { InternshipCard } from '@/components/search/InternshipCard';
import { InternshipDetailDialog } from '@/components/search/InternshipDetailDialog';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

const GROUPS = [
    { label: 'Seu curso', mine: true },
    { label: 'Outros cursos', mine: false }
];

function countLabel(count: number) {
    return `${count} ${count === 1 ? 'vaga' : 'vagas'}`;
}

export function InternshipSection({
    internships,
    title,
    previewLimit,
    onShowAll,
    emptyMessage
}: {
    internships: InternshipItem[];
    title?: string;
    previewLimit?: number;
    onShowAll?: () => void;
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

    const items = previewLimit ? internships.slice(0, previewLimit) : internships;
    const hasMore = previewLimit ? internships.length > previewLimit : false;

    return (
        <View className="gap-4">
            {title && (
                <View className="flex-row items-baseline justify-between gap-3">
                    <View className="flex-row items-baseline gap-2">
                        <Text
                            role="heading"
                            aria-level={2}
                            className="text-base font-bold text-foreground"
                        >
                            {title}
                        </Text>
                        <Text className="shrink-0 text-xs text-muted-foreground">
                            {countLabel(internships.length)}
                        </Text>
                    </View>
                    {onShowAll && hasMore && (
                        <Pressable
                            accessibilityRole="button"
                            hitSlop={8}
                            onPress={onShowAll}
                            className="flex-row items-center gap-1 active:opacity-70"
                        >
                            <Text className="text-xs font-semibold text-primary">Ver todas</Text>
                            <Icon as={ArrowRight} className="size-3 text-primary" />
                        </Pressable>
                    )}
                </View>
            )}
            {GROUPS.map(({ label, mine }) => {
                const visible = items.filter((item) => item.is_my_course === mine);
                if (visible.length === 0) return null;
                const total = internships.filter((item) => item.is_my_course === mine).length;
                return (
                    <View key={label} className="gap-2.5">
                        <View className="flex-row items-baseline gap-2">
                            <Text
                                role="heading"
                                aria-level={title ? 3 : 2}
                                className={cn(
                                    'text-foreground',
                                    title ? 'text-sm font-semibold' : 'text-base font-bold'
                                )}
                            >
                                {label}
                            </Text>
                            <Text className="text-xs text-muted-foreground">
                                {countLabel(total)}
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
