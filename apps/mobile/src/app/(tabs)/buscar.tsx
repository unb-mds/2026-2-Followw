import type { SearchCategory } from '@followw/core/lib/search-categories.ts';
import type { UserProfile } from '@followw/core/queries/me.ts';
import type { SubjectsQuery } from '@followw/core/queries/subjects.ts';

import {
    SEARCH_CATEGORIES,
    searchCategoryLabels,
    searchEmptyMessages,
    searchTypes,
    showsSubjects
} from '@followw/core/lib/search-categories.ts';
import {
    kindsTitle,
    type SubjectFilterParams,
    subjectsQueryFrom
} from '@followw/core/lib/subject-filters.ts';
import { internshipsQueryOptions } from '@followw/core/queries/internships.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import {
    recommendationsQueryOptions,
    showRecommendations
} from '@followw/core/queries/recommendations.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { searchQueryOptions } from '@followw/core/queries/search.ts';
import {
    SEARCH_MAX_LENGTH,
    searchText,
    subjectsQueryOptions
} from '@followw/core/queries/subjects.ts';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Briefcase, Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { HeaderBar, HeaderTitle } from '@/components/HeaderBar';
import { SchedulePreview } from '@/components/schedule/SchedulePreview';
import { Screen } from '@/components/Screen';
import {
    CatalogResults,
    type CatalogCategory,
    catalogQueryOptions
} from '@/components/search/CatalogResults';
import { InternshipResults } from '@/components/search/InternshipSection';
import { RecommendationsSection } from '@/components/search/RecommendationsSection';
import { SearchResults } from '@/components/search/SearchResults';
import { SubjectFilters } from '@/components/search/SubjectFilters';
import { SubjectResults } from '@/components/search/SubjectResults';
import { TabFilter } from '@/components/TabFilter';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useSubjectFilters } from '@/lib/search-filters';
import { cn } from '@/lib/utils';

export { ErrorState as ErrorBoundary } from '@/components/ErrorState';

type SearchView =
    | { kind: 'recommendations'; available: boolean }
    | { kind: 'catalog'; category: CatalogCategory }
    | { kind: 'search'; text: string; available: boolean }
    | { kind: 'subjects'; query: SubjectsQuery; title: string }
    | { kind: 'curriculum-login' }
    | { kind: 'internships'; text: string | null };

/** Filtros de matéria levam à lista filtrada; sem texto, recomendações, a unidade do aluno ou o catálogo. */
function searchView(
    category: SearchCategory,
    q: string,
    text: string | null,
    user: UserProfile | null | undefined,
    filters: SubjectFilterParams
): SearchView | null {
    const subjects = showsSubjects(category);
    const available = filters.hideUnavailable;
    if (subjects && filters.kind.length && !user) return { kind: 'curriculum-login' };
    const query = subjects && subjectsQueryFrom(filters, text);
    if (query) return { kind: 'subjects', query, title: kindsTitle(filters.kind) };
    if (category === 'internships') return { kind: 'internships', text };
    if (subjects && user && showRecommendations(user, { q })) {
        return { kind: 'recommendations', available };
    }
    if (text) return { kind: 'search', text, available };
    if (category === 'courses' || category === 'professors') return { kind: 'catalog', category };
    const unit = subjects && user?.unit?.code;
    const unitQuery = unit && subjectsQueryFrom(filters, null, unit);
    return unitQuery ? { kind: 'subjects', query: unitQuery, title: `Matérias da ${unit}` } : null;
}

const searchLabels: Partial<Record<SearchCategory, string>> = {
    all: 'Busque por matéria, horário, curso ou professor',
    classrooms: 'Busque por matéria, horário ou departamento',
    internships: 'Busque por estágio'
};

const isCategory = (value: unknown): value is SearchCategory =>
    SEARCH_CATEGORIES.some((category) => category === value);

export default function SearchScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ q?: string; category?: string }>();
    const me = useQuery(meQueryOptions);
    const user = me.data;
    const [q, setQ] = useState('');
    const [category, setCategory] = useState<SearchCategory>('all');
    const filters = useSubjectFilters();
    const subjects = showsSubjects(category);

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
    const view = searchView(category, q, text, user, filters);
    // Com filtros de matéria, o texto busca só matérias.
    const searchLabel =
        subjects && subjectsQueryFrom(filters, null)
            ? 'Busque por matéria, horário ou departamento'
            : (searchLabels[category] ?? 'Busque por matéria, curso ou professor');

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
                            searchQueryOptions(view.text, searchTypes[category], view.available)
                        );
                    if (view?.kind === 'recommendations')
                        return refreshQuery(
                            queryClient,
                            recommendationsQueryOptions(view.available)
                        );
                    if (view?.kind === 'catalog')
                        return view.category === 'courses'
                            ? refreshQuery(queryClient, catalogQueryOptions.courses)
                            : refreshQuery(queryClient, catalogQueryOptions.professors);
                    if (view?.kind === 'subjects')
                        return refreshQuery(queryClient, subjectsQueryOptions(view.query));
                    if (view?.kind === 'internships' && user)
                        return refreshQuery(queryClient, internshipsQueryOptions);
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
                        placeholder={`${searchLabel}...`}
                        aria-label={searchLabel}
                        className={cn('h-11 bg-card pl-10 text-sm', subjects && 'pr-12')}
                    />
                    {subjects && <SubjectFilters />}
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
                        <Text className="py-8 text-center text-sm text-muted-foreground">
                            Busque por matéria, departamento ou código de horário do SIGAA, como
                            24M34. Para selecionar horários, abra o filtro de matérias.
                        </Text>
                    )}
                    {subjects &&
                        !user &&
                        !me.isPending &&
                        text &&
                        view?.kind !== 'curriculum-login' && (
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
                        <RecommendationsSection available={view.available} />
                    )}
                    {view?.kind === 'search' && (
                        <SearchResults
                            key={category}
                            text={view.text}
                            types={searchTypes[category]}
                            available={view.available}
                            empty={searchEmptyMessages[category]}
                            onShowCategory={category === 'all' ? setCategory : undefined}
                        />
                    )}
                    {view?.kind === 'catalog' && <CatalogResults category={view.category} />}
                    {view?.kind === 'subjects' && (
                        <SubjectResults query={view.query} title={view.title} />
                    )}
                    {view?.kind === 'curriculum-login' && (
                        <Text>
                            <Text
                                className="font-bold text-primary"
                                onPress={() => router.push('/login')}
                            >
                                Entre na sua conta
                            </Text>{' '}
                            para filtrar as matérias pela matriz do seu curso.
                        </Text>
                    )}
                    {view?.kind === 'internships' &&
                        (user ? (
                            <InternshipResults text={view.text} />
                        ) : (
                            !me.isPending && (
                                <View className="items-center justify-center gap-3 rounded-2xl border border-border bg-card p-8">
                                    <View className="size-12 items-center justify-center rounded-2xl bg-primary/10">
                                        <Icon as={Briefcase} className="size-6 text-primary" />
                                    </View>
                                    <View className="max-w-sm items-center gap-1">
                                        <Text
                                            role="heading"
                                            aria-level={3}
                                            className="text-base font-semibold"
                                        >
                                            Ofertas de Estágio do SIGAA
                                        </Text>
                                        <Text className="text-center text-sm text-muted-foreground">
                                            Entre na sua conta para consultar as vagas de estágio
                                            abertas para o seu curso e para a UnB.
                                        </Text>
                                    </View>
                                    <Button className="mt-2" onPress={() => router.push('/login')}>
                                        <Text>Entrar na sua conta</Text>
                                    </Button>
                                </View>
                            )
                        ))}
                </View>
            </Screen>
            <SchedulePreview />
        </View>
    );
}
