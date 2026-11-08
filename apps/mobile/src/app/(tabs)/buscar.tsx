import type { SearchCategory } from '@followw/core/lib/search-categories.ts';
import type { UserProfile } from '@followw/core/queries/me.ts';

import { getCurrentSemester } from '@followw/core/calendar.ts';
import {
    SEARCH_CATEGORIES,
    searchCategoryLabels,
    searchEmptyMessages,
    searchTypes,
    showsSubjects
} from '@followw/core/lib/search-categories.ts';
import { allClassroomsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import {
    recommendationsQueryOptions,
    showRecommendations
} from '@followw/core/queries/recommendations.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { searchQueryOptions } from '@followw/core/queries/search.ts';
import {
    currentCurriculumPeriod,
    SEARCH_MAX_LENGTH,
    SEARCH_MIN_LENGTH,
    searchText,
    subjectsQueryOptions,
    takenCodes
} from '@followw/core/queries/subjects.ts';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { HeaderBar, HeaderTitle } from '@/components/HeaderBar';
import { SchedulePreview } from '@/components/schedule/SchedulePreview';
import { Screen } from '@/components/Screen';
import {
    CatalogResults,
    type CatalogCategory,
    catalogQueryOptions
} from '@/components/search/CatalogResults';
import { RecommendationsSection } from '@/components/search/RecommendationsSection';
import { SearchResults } from '@/components/search/SearchResults';
import { SubjectResults } from '@/components/search/SubjectResults';
import { TabFilter } from '@/components/TabFilter';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

export { ErrorState as ErrorBoundary } from '@/components/ErrorState';

type SearchView =
    | { kind: 'recommendations' }
    | { kind: 'catalog'; category: CatalogCategory }
    | { kind: 'search'; text: string }
    | { kind: 'unit'; unit: string };

/** Sem texto, as abas com matérias mostram as recomendações ou a unidade do aluno, e as demais o catálogo. */
function searchView(
    category: SearchCategory,
    q: string,
    text: string | null,
    user: UserProfile | null | undefined
): SearchView | null {
    const subjects = showsSubjects(category);
    if (subjects && user && showRecommendations(user, { q })) return { kind: 'recommendations' };
    if (text) return { kind: 'search', text };
    if (category === 'courses' || category === 'professors') return { kind: 'catalog', category };
    const unit = user?.unit?.code;
    return subjects && unit ? { kind: 'unit', unit } : null;
}

const isCategory = (value: unknown): value is SearchCategory =>
    SEARCH_CATEGORIES.some((category) => category === value);

export default function SearchScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ q?: string; category?: string }>();
    const me = useQuery(meQueryOptions);
    const user = me.data;
    const [q, setQ] = useState('');
    const [category, setCategory] = useState<SearchCategory>('all');
    const subjects = showsSubjects(category);
    const currentPeriod = currentCurriculumPeriod(
        user?.entry_semester,
        getCurrentSemester()?.semester
    );

    // links vindos de outras telas (matéria, docente, curso) preenchem a busca
    useEffect(() => {
        if (params.q === undefined && params.category === undefined) return;
        if (params.q !== undefined) {
            // oxlint-disable-next-line react-hooks-js/set-state-in-effect -- sincroniza com params de navegação
            setQ(params.q);
        }
        setCategory(isCategory(params.category) ? params.category : 'all');
        router.setParams({ q: undefined, category: undefined });
    }, [params.q, params.category, router]);

    // Texto aplicado após o debounce de 300 ms; inválido mantém o anterior.
    const [text, setText] = useState(() => searchText(q));
    useEffect(() => {
        const timer = setTimeout(() => setText((previous) => searchText(q, previous)), 300);
        return () => clearTimeout(timer);
    }, [q]);
    const view = searchView(category, q, text, user);
    const history = useQuery({ ...allClassroomsQueryOptions, enabled: subjects && Boolean(user) });
    const taken = useMemo(() => (history.data ? takenCodes(history.data) : null), [history.data]);

    return (
        <View className="relative flex-1 bg-background">
            <Screen
                header={
                    <HeaderBar>
                        <HeaderTitle>Buscar</HeaderTitle>
                    </HeaderBar>
                }
                keyboardDismissMode="on-drag"
                contentContainerClassName="gap-5"
                onRefreshData={(queryClient) => {
                    if (view?.kind === 'search')
                        return refreshQuery(
                            queryClient,
                            searchQueryOptions(view.text, searchTypes[category])
                        );
                    if (view?.kind === 'recommendations')
                        return refreshQuery(queryClient, recommendationsQueryOptions);
                    if (view?.kind === 'catalog')
                        return view.category === 'courses'
                            ? refreshQuery(queryClient, catalogQueryOptions.courses)
                            : refreshQuery(queryClient, catalogQueryOptions.professors);
                    if (view?.kind === 'unit')
                        return refreshQuery(queryClient, subjectsQueryOptions({ unit: view.unit }));
                    return refreshQuery(queryClient, meQueryOptions);
                }}
            >
                <View className="relative">
                    <View
                        pointerEvents="none"
                        className="absolute inset-y-0 left-3.5 z-10 justify-center"
                    >
                        <Icon as={Search} className="size-5 text-muted-foreground" />
                    </View>
                    <Input
                        value={q}
                        onChangeText={(value) => setQ(value.slice(0, SEARCH_MAX_LENGTH))}
                        maxLength={SEARCH_MAX_LENGTH}
                        returnKeyType="search"
                        autoCapitalize="none"
                        autoCorrect={false}
                        clearButtonMode="while-editing"
                        placeholder="Busque por matéria, curso ou professor..."
                        aria-label="Busque por matéria, curso ou professor"
                        className="h-11 bg-card pl-10 text-sm"
                    />
                </View>
                <TabFilter
                    label="Categoria da busca"
                    value={category}
                    options={SEARCH_CATEGORIES}
                    labels={searchCategoryLabels}
                    onChange={setCategory}
                    className="-my-2"
                />
                <View className="gap-5 pb-8">
                    {!view && (
                        <Text className="py-8 text-center text-sm text-muted-foreground">{`Digite de ${SEARCH_MIN_LENGTH} a ${SEARCH_MAX_LENGTH} caracteres do nome, código da matéria, curso ou professor para ver os resultados.`}</Text>
                    )}
                    {subjects && !user && !me.isPending && text && (
                        <Text className="text-sm text-muted-foreground">
                            <Text
                                className="text-sm font-bold text-primary"
                                onPress={() => router.push('/login')}
                            >
                                Entre na sua conta
                            </Text>{' '}
                            para visualizar seu fluxo.
                        </Text>
                    )}
                    {view?.kind === 'recommendations' && (
                        <RecommendationsSection currentPeriod={currentPeriod} taken={taken} />
                    )}
                    {view?.kind === 'search' && (
                        <SearchResults
                            key={category}
                            text={view.text}
                            types={searchTypes[category]}
                            empty={searchEmptyMessages[category]}
                            currentPeriod={currentPeriod}
                            taken={taken}
                            onShowCategory={category === 'all' ? setCategory : undefined}
                        />
                    )}
                    {view?.kind === 'catalog' && <CatalogResults category={view.category} />}
                    {view?.kind === 'unit' && (
                        <SubjectResults
                            unit={view.unit}
                            currentPeriod={currentPeriod}
                            taken={taken}
                        />
                    )}
                </View>
            </Screen>
            <SchedulePreview />
        </View>
    );
}
