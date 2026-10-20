import {
    RouterContextProvider,
    createMemoryHistory,
    createRootRoute,
    createRouter
} from '@tanstack/react-router';
import { renderToStaticMarkup } from 'react-dom/server';

import { parseRouterSearch, stringifyRouterSearch } from '#/lib/search-params';

// router mínimo com a serialização de busca do app, para componentes com Link
export function renderWithRouter(element: React.ReactNode) {
    const router = createRouter({
        routeTree: createRootRoute(),
        history: createMemoryHistory(),
        parseSearch: parseRouterSearch,
        stringifySearch: stringifyRouterSearch
    });
    return renderToStaticMarkup(
        <RouterContextProvider router={router}>{element}</RouterContextProvider>
    );
}
