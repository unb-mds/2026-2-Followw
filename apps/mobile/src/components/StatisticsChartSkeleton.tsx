import { View } from 'react-native';

import { repeat } from '@/components/LoadingSkeleton';
import { Skeleton } from '@/components/ui/skeleton';

export function StatisticsChartSkeleton() {
    return (
        <View className="gap-3">
            <View className="items-center py-1">
                <Skeleton className="size-44 rounded-full" />
            </View>
            <View className="gap-2">
                {repeat(3, () => (
                    <Skeleton className="h-3 w-full" />
                ))}
            </View>
        </View>
    );
}
