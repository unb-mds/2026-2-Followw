import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test } from 'bun:test';

import type { UserProfile } from '#/queries/me';

import { TodayDashboard } from '#/components/home/TodayDashboard';

import { renderWithRouter } from '../../helpers/router';

const user: UserProfile = {
    name: 'Discente',
    registration: '251000000',
    photo: null,
    bio: null,
    unit: null,
    course: null,
    entry_semester: null,
    integralization: null,
    workload: null,
    period_max_workload: null,
    ira: null,
    mp: null,
    level: 'Graduação'
};

test('atalho para avaliação institucional aparece apenas na home autenticada', () => {
    const day = { date: '2026-11-28', weekday: 6 };
    const dashboard = (profile: UserProfile | null) =>
        renderWithRouter(
            <QueryClientProvider client={new QueryClient()}>
                <TodayDashboard
                    user={profile}
                    now={{ ...day, time: '08:00' }}
                    day={day}
                    label="Hoje"
                />
            </QueryClientProvider>
        );

    expect(dashboard(user)).toContain('href="/avaliacao-institucional"');
    expect(dashboard(null)).not.toContain('Avaliação institucional');
});
