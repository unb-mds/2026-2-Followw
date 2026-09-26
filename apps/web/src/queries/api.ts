import createQueryHooks from 'openapi-react-query';

import { apiClient } from '#/queries/client.ts';

export const api = createQueryHooks(apiClient);
