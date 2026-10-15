import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RestaurantAccount } from '#/components/ru/RestaurantAccount';
import { credentialsQueryOptions, statementQueryOptions } from '#/queries/restaurant-account';

const client = new QueryClient({
    defaultOptions: { queries: { retry: 2, retryDelay: 1000 } }
});
client.setQueryData(statementQueryOptions('251000000').queryKey, {
    balance: '12.50', group: 2, entries: []
});
client.setQueryData(credentialsQueryOptions('251000000').queryKey, {
    token: 'TEST', valid_until: '2027-03-01'
});
createRoot(document.getElementById('root')!).render(
    <QueryClientProvider client={client}>
        <RestaurantAccount registration="251000000" />
    </QueryClientProvider>
);
