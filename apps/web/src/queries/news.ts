import { api } from '#/queries/api.ts';

export const newsQueryOptions = api.queryOptions('get', '/news');
