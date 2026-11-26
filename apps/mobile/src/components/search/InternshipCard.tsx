import type { InternshipItem } from '@followw/core/queries/internships.ts';

import { titleCase } from '@followw/core/lib/profile.ts';
import { formatInternshipDate, formatInternshipMoney } from '@followw/core/queries/internships.ts';
import { Briefcase, Calendar, Users } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export function InternshipCard({
    internship,
    onPress
}: {
    internship: InternshipItem;
    onPress: () => void;
}) {
    const stipend = formatInternshipMoney(internship.stipend);
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={titleCase(internship.title)}
            onPress={onPress}
            className="gap-3 rounded-2xl border border-border bg-card p-4 active:border-primary/40 active:bg-primary/5"
        >
            <View className="flex-row items-center gap-2">
                <View className="size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Icon as={Briefcase} className="size-5 text-primary" />
                </View>
                <Text
                    role="heading"
                    aria-level={3}
                    className="min-w-0 flex-1 text-sm leading-snug font-semibold"
                >
                    {titleCase(internship.title)}
                </Text>
            </View>
            <View className="flex-row flex-wrap items-center gap-x-4 gap-y-2">
                <Text className="text-xs font-medium text-foreground">
                    {stipend ? (
                        <Text className="text-xs font-medium text-primary">{stipend}</Text>
                    ) : (
                        'Bolsa a combinar'
                    )}
                </Text>
                <View className="flex-row items-center gap-1">
                    <Icon as={Users} className="size-3.5 text-muted-foreground" />
                    <Text className="text-xs text-muted-foreground">
                        {internship.vacancies} {internship.vacancies === 1 ? 'vaga' : 'vagas'}
                    </Text>
                </View>
                <View className="flex-row items-center gap-1">
                    <Icon as={Calendar} className="size-3.5 text-muted-foreground" />
                    <Text className="text-xs text-muted-foreground">
                        Inscrições até {formatInternshipDate(internship.published_until)}
                    </Text>
                </View>
            </View>
        </Pressable>
    );
}
