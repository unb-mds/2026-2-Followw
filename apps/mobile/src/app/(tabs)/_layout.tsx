import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';

// a barra visível é a BottomNavigation do layout raiz; o TabList só registra as abas
export default function TabsLayout() {
    return (
        <Tabs>
            <TabSlot />
            <TabList style={{ display: 'none' }}>
                <TabTrigger name="index" href="/" />
                <TabTrigger name="turmas" href="/turmas" />
                <TabTrigger name="ru" href="/ru" />
                <TabTrigger name="buscar" href="/buscar" />
                <TabTrigger name="perfil" href="/perfil" />
            </TabList>
        </Tabs>
    );
}
