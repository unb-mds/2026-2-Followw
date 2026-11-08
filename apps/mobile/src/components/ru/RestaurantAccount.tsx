import type { Day } from '@followw/core/lib/schedule.ts';
import type {
    RestaurantCredentials,
    RestaurantStatement
} from '@followw/core/queries/restaurant-account.ts';
import type { UseQueryResult } from '@tanstack/react-query';

import { documentRefusal } from '@followw/core/lib/documents.ts';
import { useFailureMessage, useOnline } from '@followw/core/lib/online.ts';
import {
    entryDescription,
    insufficientMealBalance,
    statementEntries
} from '@followw/core/lib/restaurant.ts';
import { nowInBrasilia } from '@followw/core/lib/schedule.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import {
    credentialsQueryOptions,
    statementQueryOptions
} from '@followw/core/queries/restaurant-account.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QrCode, RefreshCw } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { LoadingText } from '@/components/LoadingText';
import { StudentCard } from '@/components/ru/StudentCard';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger
} from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useColor } from '@/lib/colors';
import { cn } from '@/lib/utils';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateTime = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short'
});

export function RestaurantAccount({
    registration,
    openCard = false
}: {
    registration: string;
    openCard?: boolean;
}) {
    const queryClient = useQueryClient();
    const primary = useColor('primary');
    const statementOptions = statementQueryOptions(registration);
    const credentialsOptions = credentialsQueryOptions(registration);
    const statement = useQuery(statementOptions);
    const credentials = useQuery(credentialsOptions);
    const [refreshing, setRefreshing] = useState(false);
    const [coolingDown, setCoolingDown] = useState(false);
    const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            if (cooldownTimer.current !== null) clearTimeout(cooldownTimer.current);
        },
        []
    );

    const refreshDisabled =
        coolingDown || refreshing || statement.isFetching || credentials.isFetching;
    const refresh = async (target: 'statement' | 'credentials' | 'all' = 'all') => {
        if (cooldownTimer.current !== null || refreshDisabled) return;
        cooldownTimer.current = setTimeout(() => {
            cooldownTimer.current = null;
            setCoolingDown(false);
        }, 10_000);
        setCoolingDown(true);
        setRefreshing(true);
        const pending: Promise<unknown>[] = [];
        if (target !== 'credentials') {
            pending.push(refreshQuery(queryClient, statementOptions, { retry: false }));
        }
        if (target !== 'statement') {
            pending.push(refreshQuery(queryClient, credentialsOptions, { retry: false }));
        }
        await Promise.allSettled(pending);
        setRefreshing(false);
    };

    const cardDrawer = (
        <StudentCardDrawer
            credentials={credentials}
            requested={openCard}
            onRetry={() => refresh('credentials')}
            retryDisabled={refreshDisabled}
        />
    );

    // o carregamento ocupa o lugar do rótulo do saldo
    const loadingStatement = statement.isPending && !statement.data;
    const statementStatus = (
        <AccountStatus
            query={statement}
            hasData={Boolean(statement.data)}
            label="saldo e extrato"
            onRetry={() => refresh('statement')}
            retryDisabled={refreshDisabled}
        />
    );

    return (
        <View accessibilityLabel="Minha conta" className="mt-4 gap-3">
            <View className="flex-row items-center justify-between px-1">
                <Text
                    role="heading"
                    aria-level={2}
                    className="text-lg font-extrabold text-foreground"
                >
                    Minha conta
                </Text>
                <Button
                    variant="ghost"
                    size="xs"
                    onPress={() => void refresh()}
                    disabled={refreshDisabled}
                >
                    {refreshing ? (
                        <ActivityIndicator size="small" color={primary} />
                    ) : (
                        <Icon as={RefreshCw} className="size-4 text-primary" />
                    )}
                    <Text className="text-primary">
                        {refreshing ? 'Atualizando...' : 'Atualizar'}
                    </Text>
                </Button>
            </View>

            <Card>
                <CardContent>
                    <View
                        className={cn(
                            'flex-row items-center justify-between gap-2',
                            !loadingStatement && 'mb-2'
                        )}
                    >
                        {loadingStatement ? (
                            statementStatus
                        ) : (
                            <Text className="text-xs font-semibold text-muted-foreground">
                                Saldo disponível
                            </Text>
                        )}
                        {!statement.data && cardDrawer}
                    </View>
                    {statement.data && (
                        <StatementDetails statement={statement.data} action={cardDrawer} />
                    )}
                    {!loadingStatement && statementStatus}
                </CardContent>
            </Card>
        </View>
    );
}

function StudentCardDrawer({
    credentials,
    requested,
    onRetry,
    retryDisabled
}: {
    credentials: UseQueryResult<RestaurantCredentials>;
    requested: boolean;
    onRetry: () => Promise<void>;
    retryDisabled: boolean;
}) {
    const [open, setOpen] = useState(false);
    if (requested && !open) setOpen(true);

    return (
        <Drawer showSwipeHandle open={open} onOpenChange={setOpen}>
            <DrawerTrigger asChild>
                <Button
                    variant="outline"
                    size="icon-sm"
                    className="size-10 rounded-xl"
                    accessibilityLabel="Ver QR code da carteirinha"
                >
                    <Icon as={QrCode} className="size-6" />
                </Button>
            </DrawerTrigger>
            <DrawerContent className="mx-auto max-w-lg">
                <DrawerHeader>
                    <DrawerTitle>Carteirinha estudantil</DrawerTitle>
                    <DrawerDescription>
                        QR code para acesso ao Restaurante Universitário.
                    </DrawerDescription>
                </DrawerHeader>
                <ScrollView contentContainerClassName="p-4">
                    {credentials.data && <StudentCard credentials={credentials.data} />}
                    <AccountStatus
                        query={credentials}
                        hasData={Boolean(credentials.data)}
                        label="carteirinha"
                        failure={documentRefusal(credentials.error)}
                        showUpdatedAt={false}
                        onRetry={onRetry}
                        retryDisabled={retryDisabled}
                    />
                </ScrollView>
                <DrawerFooter>
                    <DrawerClose asChild>
                        <Button variant="outline">
                            <Text>Fechar</Text>
                        </Button>
                    </DrawerClose>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    );
}

export function StatementDetails({
    statement,
    action,
    now = nowInBrasilia()
}: {
    statement: RestaurantStatement;
    action?: React.ReactNode;
    now?: Day & { time: string };
}) {
    const insufficient = insufficientMealBalance(statement.balance, statement.group, now);
    const entries = statementEntries(statement);
    return (
        <>
            <View className="flex-row items-center justify-between gap-3">
                <Text
                    className={cn(
                        'shrink text-4xl font-extrabold text-primary',
                        insufficient && 'text-destructive'
                    )}
                >
                    {statement.balance == null
                        ? 'Saldo não informado'
                        : currency.format(Number(statement.balance))}
                </Text>
                {action}
            </View>
            <Accordion type="single" collapsible>
                <View className="mt-4 border-t border-border pt-3">
                    <AccordionItem value="statement" className="border-b-0">
                        <AccordionTrigger className="mb-2 py-0">
                            <Text className="text-primary">Extrato do RU</Text>
                        </AccordionTrigger>
                        <AccordionContent className="pb-0">
                            {entries.length === 0 ? (
                                <Text className="mt-3 text-sm text-muted-foreground">
                                    Nenhuma movimentação no extrato.
                                </Text>
                            ) : (
                                <ScrollView nestedScrollEnabled className="max-h-64">
                                    {entries.map((entry) => (
                                        <View
                                            key={`${entry.occurred_at}-${entry.description}-${entry.amount}`}
                                            className="flex-row items-baseline gap-2"
                                        >
                                            <Text
                                                numberOfLines={1}
                                                className="shrink text-sm font-semibold text-foreground"
                                            >
                                                {entryDescription(entry.description)}
                                            </Text>
                                            <Text className="shrink-0 text-xs text-muted-foreground">
                                                {dateTime.format(new Date(entry.occurred_at))}
                                            </Text>
                                            <Text
                                                className={cn(
                                                    'ml-auto shrink-0 text-sm font-bold',
                                                    Number(entry.amount) < 0
                                                        ? 'text-destructive'
                                                        : 'text-success'
                                                )}
                                            >
                                                {currency.format(Number(entry.amount))}
                                            </Text>
                                        </View>
                                    ))}
                                </ScrollView>
                            )}
                        </AccordionContent>
                    </AccordionItem>
                </View>
            </Accordion>
        </>
    );
}

function AccountStatus({
    query,
    hasData,
    label,
    failure,
    showUpdatedAt = true,
    onRetry,
    retryDisabled
}: {
    query: Pick<UseQueryResult, 'isPending' | 'isError' | 'dataUpdatedAt'>;
    hasData: boolean;
    label: string;
    failure?: string | null;
    showUpdatedAt?: boolean;
    onRetry: () => Promise<void>;
    retryDisabled: boolean;
}) {
    const online = useOnline();
    const failureMessage = useFailureMessage(
        hasData ? 'Não foi possível atualizar.' : `Não foi possível carregar ${label}.`
    );
    // offline com dado salvo já é dito pelo banner
    const showError = query.isError && (online || !hasData);

    return (
        <View accessibilityLiveRegion="polite">
            {query.isPending && !hasData && (
                <LoadingText className="justify-start py-0">Carregando {label}...</LoadingText>
            )}
            {showError && (
                <Text className="text-xs text-destructive">
                    {failure ?? failureMessage}{' '}
                    <Text
                        accessibilityRole="button"
                        accessibilityState={{ disabled: retryDisabled }}
                        onPress={retryDisabled ? undefined : () => void onRetry()}
                        className={cn(
                            'text-xs font-medium text-primary',
                            retryDisabled && 'opacity-50'
                        )}
                    >
                        Tentar novamente
                    </Text>
                </Text>
            )}
            {showUpdatedAt && hasData && query.dataUpdatedAt > 0 && (
                <Text className="text-xs text-muted-foreground">
                    Atualizado em {dateTime.format(new Date(query.dataUpdatedAt))}
                </Text>
            )}
        </View>
    );
}
