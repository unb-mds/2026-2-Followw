import createQueryHooks from 'openapi-react-query';

import { apiClient } from './client.ts';

export const api = createQueryHooks(apiClient);
