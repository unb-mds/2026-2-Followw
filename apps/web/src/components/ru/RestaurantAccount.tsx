import type { UseQueryResult } from '@tanstack/react-query';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QrCode, RefreshCw, Wallet } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState, useSyncExternalStore } from 'react';

import type { RestaurantCredentials, RestaurantStatement } from '#/queries/restaurant-account';

import { cardIsExpired } from '#/lib/restaurant';
import { nowInBrasilia } from '#/lib/schedule';
import { refreshQuery } from '#/queries/refresh';
import {
    credentialsQueryOptions,
    restoreRestaurantAccount,
    statementQueryOptions
} from '#/queries/restaurant-account';

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

const subscribe = () => () => {};

export function RestaurantAccount({ registration }: { registration: string }) {
    const queryClient = useQueryClient();
    const hydrated = useSyncExternalStore(
        subscribe,
        () => true,
        () => false
    );
    useEffect(() => {
        restoreRestaurantAccount(queryClient, registration);
    }, [queryClient, registration]);

    const statementOptions = statementQueryOptions(registration);
    const credentialsOptions = credentialsQueryOptions(registration);
    const statement = useQuery({ ...statementOptions, enabled: hydrated });
    const credentials = useQuery({ ...credentialsOptions, enabled: hydrated });
    const [refreshing, setRefreshing] = useState(false);
    const refresh = async () => {
        setRefreshing(true);
        await Promise.allSettled([
            refreshQuery(queryClient, statementOptions),
            refreshQuery(queryClient, credentialsOptions)
        ]);
        setRefreshing(false);
    };

    return (
        <section className="mt-8 space-y-3" aria-label="Minha conta do RU">
            <div className="flex items-center justify-between px-1">
                <h2 className="text-lg font-extrabold text-ink">Minha conta do RU</h2>
                <button
                    type="button"
                    onClick={refresh}
                    disabled={refreshing || statement.isFetching || credentials.isFetching}
                    className="flex cursor-pointer items-center gap-1 text-xs font-bold text-primary-dark disabled:opacity-60"
                >
                    <RefreshCw
                        className={refreshing ? 'size-4 animate-spin' : 'size-4'}
                        aria-hidden="true"
                    />
                    {refreshing ? 'Atualizando...' : 'Atualizar'}
                </button>
            </div>

            <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-muted">
                    <Wallet className="size-5" aria-hidden="true" />
                    Saldo disponível
                </div>
                {statement.data && <StatementDetails statement={statement.data} />}
                <AccountStatus
                    query={statement}
                    hasData={Boolean(statement.data)}
                    label="saldo e extrato"
                />
            </div>

            <details className="rounded-2xl border border-line bg-white p-4 shadow-sm">
                <summary className="cursor-pointer text-sm font-bold text-ink">
                    <QrCode className="mr-2 inline size-5 text-primary-dark" aria-hidden="true" />
                    Carteirinha estudantil
                </summary>
                {credentials.data && <StudentCard credentials={credentials.data} />}
                <AccountStatus
                    query={credentials}
                    hasData={Boolean(credentials.data)}
                    label="carteirinha"
                />
            </details>
        </section>
    );
}

export function StatementDetails({ statement }: { statement: RestaurantStatement }) {
    return (
        <>
            <p className="text-3xl font-extrabold text-primary-dark tabular-nums">
                {statement.balance == null
                    ? 'Saldo não informado'
                    : currency.format(Number(statement.balance))}
            </p>
            <details className="mt-4 border-t border-line pt-3">
                <summary className="cursor-pointer text-sm font-bold text-primary-dark">
                    Extrato do RU
                </summary>
                {statement.entries.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">Nenhuma movimentação no extrato.</p>
                ) : (
                    <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto">
                        {statement.entries.map((entry) => (
                            <li
                                key={`${entry.occurred_at}-${entry.description}-${entry.amount}`}
                                className="flex items-center justify-between gap-3 py-3"
                            >
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-ink">
                                        {entry.description.replace(/^grupo\s*\d+\s+/i, '')}
                                    </p>
                                    <p className="mt-1 text-xs text-muted">
                                        {dateTime.format(new Date(entry.occurred_at))}
                                    </p>
                                </div>
                                <span className="shrink-0 text-sm font-bold text-ink tabular-nums">
                                    {currency.format(Number(entry.amount))}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </details>
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
                <p className="text-sm font-semibold text-warning">
                    Carteirinha vencida. Atualize para consultar uma nova carteirinha no SIGAA.
                </p>
            ) : (
                <>
                    <QRCodeSVG
                        value={credentials.token}
                        size={256}
                        marginSize={4}
                        level="M"
                        fgColor="var(--color-night)"
                        bgColor="var(--color-login-white)"
                        title="QR code da carteirinha estudantil"
                        className="mx-auto h-auto w-64 max-w-full"
                    />
                    <p className="mt-2 text-sm text-muted">
                        Apresente este QR code na entrada do RU.
                    </p>
                </>
            )}
            <p className="mt-2 text-xs font-bold text-muted">
                Validade: {validity.format(new Date(`${credentials.valid_until}T00:00:00Z`))}
            </p>
        </div>
    );
}

function AccountStatus({
    query,
    hasData,
    label
}: {
    query: Pick<UseQueryResult, 'isPending' | 'isError' | 'dataUpdatedAt' | 'refetch'>;
    hasData: boolean;
    label: string;
}) {
    return (
        <div className="mt-3 text-xs text-muted" aria-live="polite">
            {query.isPending && !hasData && <p>Carregando {label}...</p>}
            {query.isError && (
                <p>
                    {hasData
                        ? 'Não foi possível atualizar. Exibindo os últimos dados salvos.'
                        : `Não foi possível carregar ${label}.`}{' '}
                    <button
                        type="button"
                        onClick={() => query.refetch()}
                        className="cursor-pointer font-bold text-primary-dark"
                    >
                        Tentar novamente
                    </button>
                </p>
            )}
            {hasData && query.dataUpdatedAt > 0 && (
                <p className="mt-1">
                    Atualizado em {dateTime.format(new Date(query.dataUpdatedAt))}
                </p>
            )}
        </div>
    );
}
