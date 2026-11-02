import type { QueryKey, UseQueryOptions } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { Button } from '#/components/ui/button';
import { type Page, useNextPages } from '#/queries/pages';

const PREVIEW_SIZE = 5;

/** Lista paginada pela API; com `onShowAll`, só uma prévia que leva à aba da categoria. */
export function PagedSection<T, E, K extends QueryKey>({
    title,
    count,
    noun,
    first,
    pageOptions,
    onShowAll,
    children
}: {
    title: string;
    count: string;
    noun: string;
    first: Page<T>;
    pageOptions: (page: number) => UseQueryOptions<Page<T>, E, Page<T>, K>;
    onShowAll?: () => void;
    children: (items: T[]) => ReactNode;
}) {
    const pages = useNextPages(first, pageOptions);
    if (first.items.length === 0) return null;

    return (
        <section aria-label={title} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-bold text-foreground">{title}</h2>
                <span className="shrink-0 text-xs text-muted-foreground">{count}</span>
            </div>
            {children(onShowAll ? first.items.slice(0, PREVIEW_SIZE) : pages.items)}
            {pages.failed && (
                <p className="text-center text-xs text-destructive">{`Não foi possível carregar mais ${noun}.`}</p>
            )}
            {onShowAll
                ? first.total > PREVIEW_SIZE && (
                      <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={onShowAll}
                          className="mt-1 self-center text-xs"
                      >
                          {`Ver todos os ${noun} (${first.total})`}
                      </Button>
                  )
                : pages.remaining > 0 && (
                      <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pages.loading}
                          onClick={pages.loadMore}
                          className="mt-1 self-center text-xs"
                      >
                          {pages.loading
                              ? 'Carregando...'
                              : `Ver mais ${noun} (${pages.remaining} restantes)`}
                      </Button>
                  )}
        </section>
    );
}
