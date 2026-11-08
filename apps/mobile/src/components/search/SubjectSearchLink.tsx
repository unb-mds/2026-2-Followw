import { SEARCH_MAX_LENGTH } from '@followw/core/queries/subjects.ts';
import { useRouter } from 'expo-router';
import { createContext, useContext } from 'react';
import { Pressable } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

// quem abriu o link (ex.: o diálogo da turma) fecha antes de buscar
export const SearchLinkContext = createContext<(() => void) | undefined>(undefined);

/** Abre a busca de matérias/docentes com o texto informado. */
export function openSearch(
    router: ReturnType<typeof useRouter>,
    query: string,
    category?: 'classrooms'
) {
    router.navigate({
        pathname: '/buscar',
        params: { q: query.trim().slice(0, SEARCH_MAX_LENGTH), ...(category && { category }) }
    });
}

export function SubjectSearchLink({
    query,
    children,
    className
}: {
    query: string;
    children: React.ReactNode;
    className?: string;
}) {
    const router = useRouter();
    const onOpen = useContext(SearchLinkContext);
    return (
        <Pressable
            accessibilityRole="link"
            hitSlop={4}
            onPress={() => {
                onOpen?.();
                openSearch(router, query);
            }}
            className="active:opacity-60"
        >
            <Text className={cn('text-sm', className)}>{children}</Text>
        </Pressable>
    );
}
