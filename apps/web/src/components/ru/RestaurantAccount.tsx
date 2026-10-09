import type { UseQueryResult } from '@tanstack/react-query';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QrCode, RefreshCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';

import type { Day } from '#/lib/schedule';
import type { RestaurantCredentials, RestaurantStatement } from '#/queries/restaurant-account';

import { LoadingText } from '#/components/LoadingText';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from '#/components/ui/accordion';
import { Button } from '#/components/ui/button';
import { Card, CardContent } from '#/components/ui/card';
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger
} from '#/components/ui/drawer';
import { Spinner } from '#/components/ui/spinner';
import { useFailureMessage, useOnline } from '#/lib/online';
import { cardIsExpired, insufficientMealBalance } from '#/lib/restaurant';
import { nowInBrasilia } from '#/lib/schedule';
import { cn } from '#/lib/shadcn';
import { refreshQuery } from '#/queries/refresh';
import { credentialsQueryOptions, statementQueryOptions } from '#/queries/restaurant-account';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateTime = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short'
});
const validity = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric'
});

export function RestaurantAccount({ registration }: { registration: string }) {
    const queryClient = useQueryClient();
    const statementOptions = statementQueryOptions(registration);
    const credentialsOptions = credentialsQueryOptions(registration);
    const statement = useQuery(statementOptions);
    const credentials = useQuery(credentialsOptions);
    const [refreshing, setRefreshing] = useState(false);
    const refresh = async () => {
        setRefreshing(true);
        await Promise.allSettled([
            refreshQuery(queryClient, statementOptions),
            refreshQuery(queryClient, credentialsOptions)
        ]);
        setRefreshing(false);
    };

    const cardDrawer = <StudentCardDrawer credentials={credentials} />;

    return (
        <section className="mt-8 flex flex-col gap-3" aria-label="Minha conta">
            <div className="flex items-center justify-between px-1">
                <h2 className="text-lg font-extrabold text-foreground">Minha conta</h2>
                <Button
                    variant="ghost"
                    size="xs"
                    onClick={refresh}
                    disabled={refreshing || statement.isFetching || credentials.isFetching}
                    className="text-primary"
                >
                    {refreshing ? (
                        <Spinner aria-hidden="true" />
                    ) : (
                        <RefreshCw className="size-4" aria-hidden="true" />
                    )}
                    {refreshing ? 'Atualizando...' : 'Atualizar'}
                </Button>
            </div>

            <Card>
                <CardContent>
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                            Saldo disponível
                        </div>
                        {!statement.data && cardDrawer}
                    </div>
                    {statement.data && (
                        <StatementDetails statement={statement.data} action={cardDrawer} />
                    )}
                    <AccountStatus
                        query={statement}
                        hasData={Boolean(statement.data)}
                        label="saldo e extrato"
                    />
                </CardContent>
            </Card>
        </section>
    );
}

function StudentCardDrawer({
    credentials
}: {
    credentials: UseQueryResult<RestaurantCredentials>;
}) {
    return (
        <Drawer showSwipeHandle>
            <DrawerTrigger
                render={
                    <Button
                        variant="outline"
                        size="icon-sm"
                        className="size-10 rounded-xl"
                        aria-label="Ver QR code da carteirinha"
                        title="Ver QR code da carteirinha"
                    />
                }
            >
                <QrCode className="size-6" aria-hidden="true" />
            </DrawerTrigger>
            <DrawerContent data-theme="light" className="mx-auto max-w-lg">
                <DrawerHeader className="md:text-center">
                    <DrawerTitle>Carteirinha estudantil</DrawerTitle>
                    <DrawerDescription>
                        QR code para acesso ao Restaurante Universitário.
                    </DrawerDescription>
                </DrawerHeader>
                <div className="overflow-y-auto p-4">
                    {credentials.data && <StudentCard credentials={credentials.data} />}
                    <AccountStatus
                        query={credentials}
                        hasData={Boolean(credentials.data)}
                        label="carteirinha"
                        showUpdatedAt={false}
                    />
                </div>
                <DrawerFooter>
                    <DrawerClose render={<Button variant="outline" />}>Fechar</DrawerClose>
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
    const warning = insufficientMealBalance(statement.balance, statement.group, now);
    const [first, ...rest] = statement.entries;
    const entries = first && /^saldo\b/i.test(first.description.trim()) ? rest : statement.entries;
    return (
        <>
            <div className="flex items-center justify-between gap-3">
                <p className="ph-no-capture text-4xl font-extrabold text-primary tabular-nums">
                    {statement.balance == null
                        ? 'Saldo não informado'
                        : currency.format(Number(statement.balance))}
                </p>
                {action}
            </div>
            {warning && (
                <p
                    aria-live="polite"
                    className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm font-semibold text-foreground"
                >
                    Saldo insuficiente para o {warning.meal.label.toLocaleLowerCase('pt-BR')}{' '}
                    (faltam {currency.format(warning.shortfall)}).
                </p>
            )}
            <Accordion className="mt-4 border-t border-border pt-3">
                <AccordionItem value="statement">
                    <AccordionTrigger className="mb-2 py-0 text-primary">
                        Extrato do RU
                    </AccordionTrigger>
                    <AccordionContent className="pb-0" keepMounted>
                        {entries.length === 0 ? (
                            <p className="mt-3 text-sm text-muted-foreground">
                                Nenhuma movimentação no extrato.
                            </p>
                        ) : (
                            <ul className="max-h-64 overflow-y-auto">
                                {entries.map((entry) => (
                                    <li
                                        key={`${entry.occurred_at}-${entry.description}-${entry.amount}`}
                                        className="flex items-baseline gap-2"
                                    >
                                        <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                                            {entry.description.replace(/^grupo\s*\d+\s+/i, '')}
                                        </p>
                                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                            {dateTime.format(new Date(entry.occurred_at))}
                                        </span>
                                        <span
                                            className={cn(
                                                'ml-auto shrink-0 text-sm font-bold tabular-nums',
                                                Number(entry.amount) < 0
                                                    ? 'text-destructive'
                                                    : 'text-success'
                                            )}
                                        >
                                            {currency.format(Number(entry.amount))}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </>
    );
}

export function StudentCard({
    credentials,
    date = nowInBrasilia().date
}: {
    credentials: RestaurantCredentials;
    date?: string;
}) {
    const expired = cardIsExpired(credentials.valid_until, date);
    return (
        <div className="mt-4 text-center">
            {expired ? (
                <p className="text-sm font-semibold text-destructive">
                    Carteirinha vencida. Atualize para consultar uma nova carteirinha no SIGAA.
                </p>
            ) : (
                <>
                    <QRCodeSVG
                        value={credentials.token}
                        size={256}
                        marginSize={4}
                        level="M"
                        fgColor="var(--foreground)"
                        bgColor="var(--background)"
                        title="QR code da carteirinha estudantil"
                        className="ph-no-capture mx-auto h-auto w-64 max-w-full"
                    />
                    <p className="mt-2 text-sm text-muted-foreground">
                        Apresente este QR code na entrada do RU.
                    </p>
                </>
            )}
            <p className="mt-2 text-xs font-bold text-muted-foreground">
                Validade: {validity.format(new Date(`${credentials.valid_until}T00:00:00Z`))}
            </p>
        </div>
    );
}

function AccountStatus({
    query,
    hasData,
    label,
    showUpdatedAt = true
}: {
    query: Pick<UseQueryResult, 'isPending' | 'isError' | 'dataUpdatedAt' | 'refetch'>;
    hasData: boolean;
    label: string;
    showUpdatedAt?: boolean;
}) {
    const online = useOnline();
    const failureMessage = useFailureMessage(
        hasData ? 'Não foi possível atualizar.' : `Não foi possível carregar ${label}.`
    );
    // offline com dado salvo já é dito pelo banner
    const showError = query.isError && (online || !hasData);

    return (
        <div className="text-xs text-muted-foreground" aria-live="polite">
            {query.isPending && !hasData && <LoadingText>Carregando {label}...</LoadingText>}
            {showError && (
                <p>
                    {failureMessage}{' '}
                    <Button
                        variant="link"
                        size="xs"
                        onClick={() => query.refetch()}
                        className="h-auto p-0"
                    >
                        Tentar novamente
                    </Button>
                </p>
            )}
            {showUpdatedAt && hasData && query.dataUpdatedAt > 0 && (
                <p>Atualizado em {dateTime.format(new Date(query.dataUpdatedAt))}</p>
            )}
        </div>
    );
}
