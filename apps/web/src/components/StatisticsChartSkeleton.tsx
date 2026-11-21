import { repeat } from '#/components/LoadingSkeleton';
import { Skeleton } from '#/components/ui/skeleton';

// fora do StatisticsChart para não carregar o recharts junto
export function StatisticsChartSkeleton() {
    return (
        <div className="flex flex-col gap-3">
            <div className="flex h-52 items-center justify-center">
                <Skeleton className="size-44 rounded-full" />
            </div>
            <div className="flex flex-col gap-2">
                {repeat(3, () => (
                    <Skeleton className="h-3 w-full" />
                ))}
            </div>
        </div>
    );
}
