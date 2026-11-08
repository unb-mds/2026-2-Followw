import {
    entryDescription,
    insufficientMealBalance,
    statementEntries
} from '@followw/core/lib/restaurant.ts';
import { nowInBrasilia } from '@followw/core/lib/schedule.ts';
import {
    statementQueryOptions,
    type RestaurantStatement
} from '@followw/core/queries/restaurant-account.ts';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { QueryState } from '@/components/QueryState';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateTime = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short'
});

/** Saldo e extrato do RU da conta logada. */
export function RestaurantAccount({ registration }: { registration: string }) {
    const statement = useQuery(statementQueryOptions(registration));
    return (
        <View className="gap-3">
            <Text className="px-1 text-lg font-extrabold">Minha conta</Text>
            <QueryState
                query={statement}
                loading="Carregando saldo e extrato..."
                error="Não foi possível carregar saldo e extrato."
                stale="Não foi possível atualizar o saldo."
            >
                {(data) => (
                    <>
                        <StatementDetails statement={data} />
                        {statement.dataUpdatedAt > 0 && (
                            <Text className="px-1 text-xs text-muted-foreground">
                                Atualizado em {dateTime.format(new Date(statement.dataUpdatedAt))}
                            </Text>
                        )}
                    </>
                )}
            </QueryState>
        </View>
    );
}

export function StatementDetails({ statement }: { statement: RestaurantStatement }) {
    const [open, setOpen] = useState(false);
    const insufficient = insufficientMealBalance(
        statement.balance,
        statement.group,
        nowInBrasilia()
    );
    const entries = statementEntries(statement);
    return (
        <Card>
            <CardContent>
                <Text className="text-xs font-semibold text-muted-foreground">
                    Saldo disponível
                </Text>
                <Text
                    className={cn(
                        'text-4xl font-extrabold text-primary',
                        insufficient && 'text-destructive'
                    )}
                >
                    {statement.balance == null
                        ? 'Saldo não informado'
                        : currency.format(Number(statement.balance))}
                </Text>
                <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    onPress={() => setOpen(!open)}
                    className="mt-3 flex-row items-center justify-between border-t border-border pt-3 active:opacity-60"
                >
                    <Text className="text-sm font-semibold text-primary">Extrato do RU</Text>
                    <Icon as={open ? ChevronUp : ChevronDown} className="text-primary" />
                </Pressable>
                {open &&
                    (entries.length === 0 ? (
                        <Text className="text-sm text-muted-foreground">
                            Nenhuma movimentação no extrato.
                        </Text>
                    ) : (
                        entries.map((entry) => (
                            <View
                                key={`${entry.occurred_at}-${entry.description}-${entry.amount}`}
                                className="flex-row items-baseline gap-2"
                            >
                                <View className="min-w-0 flex-1">
                                    <Text className="text-sm font-semibold" numberOfLines={1}>
                                        {entryDescription(entry.description)}
                                    </Text>
                                    <Text className="text-xs text-muted-foreground">
                                        {dateTime.format(new Date(entry.occurred_at))}
                                    </Text>
                                </View>
                                <Text
                                    className={cn(
                                        'text-sm font-bold',
                                        Number(entry.amount) < 0
                                            ? 'text-destructive'
                                            : 'text-success'
                                    )}
                                >
                                    {currency.format(Number(entry.amount))}
                                </Text>
                            </View>
                        ))
                    ))}
            </CardContent>
        </Card>
    );
}
