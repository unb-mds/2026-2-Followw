import type { components } from '@followw/core/queries/schema.gen.ts';

import { getCurrentSemester } from '@followw/core/calendar.ts';
import {
    academicIndexes,
    coursePeriod,
    titleCase,
    truncateProfileBio
} from '@followw/core/lib/profile.ts';
import { classroomsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Check, IdCard } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { PersonPhoto } from '@/components/PersonPhoto';
import { CourseProgress } from '@/components/profile/CourseProgress';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type UserProfile = components['schemas']['UserProfile'];

export function ProfileIdentity({
    user,
    displayName
}: {
    user: UserProfile;
    displayName?: string | null;
}) {
    const period = coursePeriod(user.entry_semester, getCurrentSemester()?.semester);
    return (
        <View>
            <View className="flex-row items-center gap-4">
                <PersonPhoto src={user.photo} size="lg" />
                <View className="min-w-0 flex-1 gap-4">
                    <View className="gap-1">
                        <Text
                            role="heading"
                            aria-level={1}
                            className="text-2xl leading-tight font-semibold tracking-tight"
                        >
                            {displayName || titleCase(user.name)}
                        </Text>
                        <RegistrationCopy value={user.registration} />
                    </View>
                    <View className="gap-1">
                        <Text className="text-sm text-primary">
                            {user.course && titleCase(user.course.name)}
                            {period != null && `${user.course ? ' · ' : ''}${period}º semestre`}
                        </Text>
                        <Text className="text-xs font-medium text-muted-foreground">
                            {user.level}
                        </Text>
                    </View>
                </View>
            </View>
            {user.bio && <Bio text={truncateProfileBio(user.bio)} />}
        </View>
    );
}

export function AcademicPerformance({
    user,
    action
}: {
    user: UserProfile;
    action?: React.ReactNode;
}) {
    const indexes = academicIndexes(user);
    if (indexes.length === 0 && !action) return null;
    return (
        <ProfileSection title="Desempenho" compact>
            {indexes.length > 0 && (
                <View className="flex-row gap-2">
                    {indexes.map((index) => (
                        <View
                            key={index.label}
                            accessibilityLabel={`${index.description}: ${index.value}`}
                            className="flex-1 rounded-2xl border border-border bg-card px-4 py-2 shadow-sm shadow-black/5"
                        >
                            <Text className="text-xs font-medium text-muted-foreground">
                                {index.label}
                            </Text>
                            <Text className="mt-1 text-2xl font-medium tracking-tight text-primary">
                                {index.value}
                            </Text>
                        </View>
                    ))}
                </View>
            )}
            {action && <View className="mt-3">{action}</View>}
        </ProfileSection>
    );
}

export function ProgressSection({ user }: { user: UserProfile }) {
    const { data } = useQuery(classroomsQueryOptions);
    if (user.integralization == null && !user.workload) return null;
    return (
        <ProfileSection title="Progresso do curso" compact>
            <CourseProgress user={user} classrooms={data ?? []} />
        </ProfileSection>
    );
}

export function ProfileSection({
    title,
    compact = false,
    children
}: {
    title: string;
    compact?: boolean;
    children: React.ReactNode;
}) {
    return (
        <View accessibilityLabel={title}>
            <Text
                role="heading"
                aria-level={2}
                className={cn('px-1 text-lg font-medium', compact ? 'mb-2' : 'mb-4')}
            >
                {title}
            </Text>
            {children}
        </View>
    );
}

const BIO_COLLAPSED_LINES = 3;

function Bio({ text }: { text: string }) {
    const [expanded, setExpanded] = useState(false);
    // o RN não informa se o texto foi cortado de forma uniforme entre plataformas
    const long = text.length > 140 || text.split('\n').length > BIO_COLLAPSED_LINES;
    return (
        <View className="mt-4 items-start gap-1">
            <Text
                numberOfLines={expanded ? undefined : BIO_COLLAPSED_LINES}
                className="text-sm leading-relaxed text-muted-foreground"
            >
                {text}
            </Text>
            {long && (
                <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    hitSlop={8}
                    onPress={() => setExpanded(!expanded)}
                >
                    <Text className="text-sm font-medium text-primary">
                        {expanded ? 'Ler menos' : 'Ler mais'}
                    </Text>
                </Pressable>
            )}
        </View>
    );
}

function RegistrationCopy({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await Clipboard.setStringAsync(value);
        } catch {
            return;
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={copied ? 'Copiado' : 'Copiar matrícula'}
            hitSlop={8}
            onPress={() => void copy()}
            className="flex-row items-center gap-1 self-start"
        >
            <Icon
                as={copied ? Check : IdCard}
                className={cn('size-4', copied ? 'text-primary' : 'text-muted-foreground')}
            />
            <Text className={cn('text-sm', copied ? 'text-primary' : 'text-muted-foreground')}>
                {value}
            </Text>
        </Pressable>
    );
}
