import { emptySubjectFilters } from '@followw/core/lib/subject-filters.ts';
import { act, renderHook } from '@testing-library/react-native';

import { clearSubjectFilters, setSubjectFilters, useSubjectFilters } from '@/lib/search-filters';

describe('filtros de matérias da busca', () => {
    afterEach(() => clearSubjectFilters());

    test('mudar um filtro mantém os demais', async () => {
        const { result } = await renderHook(() => useSubjectFilters());
        await act(async () => setSubjectFilters({ days: '02' }));
        await act(async () => setSubjectFilters({ kind: ['free'] }));
        expect(result.current).toEqual({ ...emptySubjectFilters, days: '02', kind: ['free'] });
    });

    test('limpar volta aos padrões', async () => {
        const { result } = await renderHook(() => useSubjectFilters());
        await act(async () => setSubjectFilters({ hideConflicts: true }));
        await act(async () => clearSubjectFilters());
        expect(result.current).toEqual(emptySubjectFilters);
    });
});
