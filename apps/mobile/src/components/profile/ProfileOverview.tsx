import type { components } from '@followw/core/queries/schema.gen.ts';

import { academicIndexes, creditsLabel, titleCase } from '@followw/core/lib/profile.ts';
import * as Clipboard from 'expo-clipboard';
import { Check, IdCard } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ListCard, Meter } from '@/components/ListCard';
import { PersonPhoto } from '@/components/PersonPhoto';
import { Card } from '@/components/ui/card';
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
    return (
        <View>
            <View className="flex-row items-center gap-4">
                <PersonPhoto src={user.photo} size="lg" />
                <View className="min-w-0 flex-1">
                    <Text
                        role="heading"
                        aria-level={1}
                        className="text-2xl leading-tight font-semibold tracking-tight"
                    >
                        {displayName || titleCase(user.name)}
                    </Text>
                    <RegistrationCopy value={user.registration} />
                    <Text className="mt-2 text-sm text-primary">
                        {[user.course && titleCase(user.course.name), user.unit?.code]
                            .filter(Boolean)
                            .join(' · ')}
                    </Text>
                    <Text className="text-xs font-medium text-muted-foreground">{user.level}</Text>
                </View>
            </View>
            {user.bio && <Bio text={user.bio} />}
        </View>
    );
}

export function AcademicPerformance({ user }: { user: UserProfile }) {
    const indexes = academicIndexes(user);
    if (indexes.length === 0) return null;
    return (
        <ProfileSection title="Desempenho">
            <Card size="sm" className="flex-row gap-0 py-0">
                {indexes.map((index, position) => (
                    <View
                        key={index.label}
                        className={cn('flex-1 px-3 py-3', position > 0 && 'border-l border-border')}
                    >
                        <Text className="text-xs font-medium text-muted-foreground">
                            {index.label}
                        </Text>
                        <Text className="mt-1 text-2xl font-semibold tracking-tight text-primary">
                            {index.value}
                        </Text>
                    </View>
                ))}
            </Card>
        </ProfileSection>
    );
}

export function ProgressSection({ user }: { user: UserProfile }) {
    const { integralization, workload } = user;
    if (integralization == null && !workload) return null;

    const items = workload && [
        { label: 'Obrigatória pendente', hours: workload.pending_mandatory },
        { label: 'Optativa pendente', hours: workload.pending_optional },
        { label: 'Complementar pendente', hours: workload.pending_complementary },
        { label: 'Total do currículo', hours: workload.total }
    ];

    return (
        <ProfileSection title="Progresso">
            <ListCard>
                {integralization != null && (
                    <Meter label="Integralização" value={integralization} />
                )}
                {items && (
                    <View className="gap-3 py-3">
                        {items.map(({ label, hours }) => (
                            <View
                                key={label}
                                className="flex-row items-baseline justify-between gap-2"
                            >
                                <Text className="text-sm text-muted-foreground">{label}</Text>
                                <Text className="text-sm font-medium">
                                    {hours}h
                                    {hours > 0 && (
                                        <Text className="text-sm text-muted-foreground">
                                            {' · '}
                                            {creditsLabel(hours)}
                                        </Text>
                                    )}
                                </Text>
                            </View>
                        ))}
                    </View>
                )}
            </ListCard>
        </ProfileSection>
    );
}

export function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View accessibilityLabel={title}>
            <Text role="heading" aria-level={2} className="mb-2 px-1 text-sm font-semibold">
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
            className="mt-0.5 flex-row items-center gap-1"
        >
            <Icon
                as={copied ? Check : IdCard}
                className={cn('size-3', copied ? 'text-primary' : 'text-muted-foreground')}
            />
            <Text className={cn('text-sm', copied ? 'text-primary' : 'text-muted-foreground')}>
                {value}
            </Text>
        </Pressable>
    );
}
