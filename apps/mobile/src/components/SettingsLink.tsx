import { Link } from 'expo-router';
import { Settings } from 'lucide-react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

export function SettingsLink() {
    return (
        <Link href="/configuracoes" asChild>
            <Button variant="ghost" size="icon-lg" accessibilityLabel="Configurações">
                <Icon as={Settings} className="size-5" />
            </Button>
        </Link>
    );
}
