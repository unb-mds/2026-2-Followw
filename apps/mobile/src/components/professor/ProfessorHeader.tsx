import type { ProfessorDetails } from '@followw/core/queries/professors.ts';

import { mailto } from '@followw/core/lib/contact.ts';
import { titleCase, unitLabel } from '@followw/core/lib/profile.ts';
import * as WebBrowser from 'expo-web-browser';
import { ArrowUpRight, Building2, Mail } from 'lucide-react-native';
import { Linking, Pressable, View } from 'react-native';

import { PersonPhoto } from '@/components/PersonPhoto';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export function ProfessorHeader({ professor }: { professor: ProfessorDetails }) {
    return (
        <View className="flex-row items-stretch gap-4 rounded-2xl border border-foreground/10 bg-card p-4 shadow-sm shadow-black/5">
            <View className="shrink-0 self-start rounded-xl border border-primary/20 bg-background/60 p-1 shadow-sm shadow-black/5">
                <PersonPhoto src={professor.photo} size="xl" />
            </View>
            <View className="min-w-0 flex-1 justify-between gap-3 py-1">
                <View className="gap-1">
                    <Text
                        role="heading"
                        aria-level={1}
                        className="text-xl leading-tight font-semibold tracking-tight text-foreground"
                    >
                        {titleCase(professor.name)}
                    </Text>
                    <View className="flex-row items-center gap-1.5">
                        <Icon as={Building2} className="size-3.5 shrink-0 text-muted-foreground" />
                        <Text
                            numberOfLines={1}
                            className="min-w-0 flex-1 text-xs text-muted-foreground"
                        >
                            {unitLabel(professor.unit)}
                        </Text>
                    </View>
                </View>
                <View className="flex-row flex-wrap items-center gap-x-4 gap-y-2">
                    {professor.email && (
                        <Pressable
                            accessibilityRole="link"
                            onPress={() => void Linking.openURL(mailto(professor.email!))}
                            className="max-w-full flex-row items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 active:bg-primary/20"
                        >
                            <Icon as={Mail} className="size-3.5 text-primary" />
                            <Text
                                numberOfLines={1}
                                className="shrink text-xs font-medium text-primary"
                            >
                                {professor.email}
                            </Text>
                        </Pressable>
                    )}
                    {professor.lattes && (
                        <ExternalLink href={professor.lattes}>Lattes</ExternalLink>
                    )}
                    <ExternalLink href={professor.url}>SIGAA</ExternalLink>
                </View>
            </View>
        </View>
    );
}

function ExternalLink({ href, children }: { href: string; children: string }) {
    return (
        <Pressable
            accessibilityRole="link"
            onPress={() => void WebBrowser.openBrowserAsync(href)}
            className="flex-row items-center gap-0.5 active:opacity-60"
        >
            <Text className="text-xs font-medium text-muted-foreground">{children}</Text>
            <Icon as={ArrowUpRight} className="size-3.5 text-muted-foreground" />
        </Pressable>
    );
}
