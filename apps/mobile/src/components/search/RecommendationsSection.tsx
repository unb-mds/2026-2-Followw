import type { CatalogSubject } from '@followw/core/queries/subjects.ts';

import { reasonLabel, recommendationsQueryOptions } from '@followw/core/queries/recommendations.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { withClassrooms } from '@followw/core/queries/subjects.ts';
import { noop, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleHelp } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { ErrorCard } from '@/components/ErrorState';
import { LoadingText } from '@/components/LoadingText';
import { TurmaSection } from '@/components/search/TurmaSection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export function RecommendationReasons({ subject }: { subject: CatalogSubject }) {
    const reasons = subject.recommendation?.reasons ?? [];
    return (
        <View accessibilityLabel="Critérios atendidos" className="gap-2">
            {reasons.map((reason) => (
                <View key={reason.code} className="flex-row items-center gap-2">
                    <Badge className="size-5 rounded-full bg-primary/10 p-0">
                        <Icon as={Check} className="size-3 text-primary" />
                    </Badge>
                    <Text className="flex-1 text-sm">{reasonLabel(reason)}</Text>
                </View>
            ))}
            {reasons.length === 0 && (
                <Text className="text-sm">
                    Atende aos critérios para cursar, sem bônus de prioridade.
                </Text>
            )}
        </View>
    );
}

function WhyDialog({ subject }: { subject: CatalogSubject }) {
    const [open, setOpen] = useState(false);
    return (
        <View className="border-t border-border p-3">
            <Button variant="ghost" size="sm" className="self-start" onPress={() => setOpen(true)}>
                <Icon as={CircleHelp} className="size-4" />
                <Text>Por que esta matéria?</Text>
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-left">Por que esta matéria?</DialogTitle>
                        <DialogDescription className="text-left">{subject.name}</DialogDescription>
                    </DialogHeader>
                    <RecommendationReasons subject={subject} />
                </DialogContent>
            </Dialog>
        </View>
    );
}

export function RecommendationsSection({
    currentPeriod,
    taken
}: {
    currentPeriod?: number | null;
    taken?: Set<string> | null;
}) {
    const client = useQueryClient();
    const query = useQuery(recommendationsQueryOptions);
    const refresh = () => void refreshQuery(client, recommendationsQueryOptions).catch(noop);
    const subjects = query.data && withClassrooms(query.data);
    return (
        <View accessibilityLabel="Matérias recomendadas" className="gap-3">
            {query.isPending ? (
                <LoadingText>Buscando recomendações...</LoadingText>
            ) : query.isLoadingError ? (
                <ErrorCard
                    message="Não foi possível carregar suas recomendações."
                    onRetry={refresh}
                />
            ) : subjects ? (
                <>
                    {query.isError && (
                        <ErrorCard
                            message="Não foi possível atualizar suas recomendações. Exibindo a última consulta."
                            onRetry={refresh}
                        />
                    )}
                    {subjects.length === 0 ? (
                        <View className="rounded-2xl border border-border bg-card p-4">
                            <Text className="text-sm">
                                Nenhuma matéria da oferta atual foi recomendada para você.
                            </Text>
                        </View>
                    ) : (
                        <TurmaSection
                            subjects={subjects}
                            currentPeriod={currentPeriod}
                            taken={taken}
                            // oxlint-disable-next-line react/no-unstable-nested-components -- render prop
                            footer={(subject) => <WhyDialog subject={subject} />}
                        />
                    )}
                </>
            ) : null}
        </View>
    );
}
