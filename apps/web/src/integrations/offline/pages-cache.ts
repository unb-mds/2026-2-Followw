// puro: também é importado pelo pwa.ts no build (Node), onde não existe import.meta.env
export const PAGES_CACHE_PREFIX = 'followw-pages-';

// versionado por build: o HTML antigo aponta para assets que o novo SW já não tem
export const pagesCacheName = (buildId: string) => PAGES_CACHE_PREFIX + buildId;

export const academicAsset =
    /\/assets\/(?:TodayDashboard|StatisticsChart|classroom-posts)-[\w-]+\.js$/;
export const academicManifestPath = (buildId: string) => `/offline-academic-${buildId}.json`;
