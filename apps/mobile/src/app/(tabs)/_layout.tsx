import { NativeTabs } from 'expo-router/native-tabs';

import { useColor } from '@/lib/colors';

export default function TabsLayout() {
    const primary = useColor('primary');
    return (
        <NativeTabs tintColor={primary}>
            <NativeTabs.Trigger name="(inicio)">
                <NativeTabs.Trigger.Label>Início</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                    sf={{ default: 'house', selected: 'house.fill' }}
                    md="home"
                />
            </NativeTabs.Trigger>
            <NativeTabs.Trigger name="turmas">
                <NativeTabs.Trigger.Label>Turmas</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                    sf={{ default: 'person.2', selected: 'person.2.fill' }}
                    md="group"
                />
            </NativeTabs.Trigger>
            <NativeTabs.Trigger name="ru">
                <NativeTabs.Trigger.Label>RU</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon sf="fork.knife" md="restaurant" />
            </NativeTabs.Trigger>
            <NativeTabs.Trigger name="perfil">
                <NativeTabs.Trigger.Label>Perfil</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                    sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
                    md="account_circle"
                />
            </NativeTabs.Trigger>
            <NativeTabs.Trigger name="buscar" role="search">
                <NativeTabs.Trigger.Label>Buscar</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
            </NativeTabs.Trigger>
        </NativeTabs>
    );
}
