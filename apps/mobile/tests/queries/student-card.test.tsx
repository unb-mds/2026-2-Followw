import type { RestaurantCredentials } from '@followw/core/queries/restaurant-account.ts';

import { addDays, nowInBrasilia } from '@followw/core/lib/schedule.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';

import { clearAccountStorage, STORAGE_KEYS, storage } from '@/lib/storage';
import { useStudentCard } from '@/queries/student-card';

import { fakeApi } from '../fakes';

const registration = '251000000';
const card = (valid_until: string): RestaurantCredentials => ({ token: 'qr', valid_until });
const today = nowInBrasilia().date;

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
        {children}
    </QueryClientProvider>
);

const saved = () => JSON.parse(storage.getString(STORAGE_KEYS.STUDENT_CARD) ?? 'null');

describe('carteirinha do RU', () => {
    let eject: () => void;
    beforeEach(() => clearAccountStorage());
    afterEach(() => eject());

    test('guarda a carteirinha válida recebida da API', async () => {
        const valid = card(addDays(today, 30));
        ({ eject } = fakeApi(() => Response.json(valid)));
        const { result } = await renderHook(() => useStudentCard(registration), { wrapper });
        await waitFor(() => expect(result.current.data).toEqual(valid));
        await waitFor(() => expect(saved()).toMatchObject({ registration, credentials: valid }));
    });

    test('mostra a carteirinha salva sem consultar a API', async () => {
        const valid = card(addDays(today, 30));
        storage.set(
            STORAGE_KEYS.STUDENT_CARD,
            JSON.stringify({ registration, credentials: valid, updatedAt: Date.now() })
        );
        const { api, eject: stop } = fakeApi(() => new Response(null, { status: 503 }));
        eject = stop;
        const { result } = await renderHook(() => useStudentCard(registration), { wrapper });
        expect(result.current.data).toEqual(valid);
        expect(api.requests).toHaveLength(0);
    });

    test('ignora a carteirinha salva de outra conta', async () => {
        storage.set(
            STORAGE_KEYS.STUDENT_CARD,
            JSON.stringify({
                registration: '200000000',
                credentials: card(addDays(today, 30)),
                updatedAt: Date.now()
            })
        );
        ({ eject } = fakeApi(() => Response.json({ detail: 'erro' }, { status: 503 })));
        const { result } = await renderHook(() => useStudentCard(registration), { wrapper });
        expect(result.current.data).toBeUndefined();
    });

    test('carteirinha salva vencida dá lugar à da API', async () => {
        storage.set(
            STORAGE_KEYS.STUDENT_CARD,
            // a validade é por mês
            JSON.stringify({ registration, credentials: card(addDays(today, -40)), updatedAt: 1 })
        );
        const valid = card(addDays(today, 30));
        ({ eject } = fakeApi(() => Response.json(valid)));
        const { result } = await renderHook(() => useStudentCard(registration), { wrapper });
        expect(result.current.data).toBeUndefined();
        await waitFor(() => expect(saved().credentials).toEqual(valid));
    });
});
