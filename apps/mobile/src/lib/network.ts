import * as Network from 'expo-network';
import { AppState } from 'react-native';

type NetworkState = Awaited<ReturnType<typeof Network.getNetworkStateAsync>>;

const isOnline = (state: NetworkState) => state.isConnected !== false;

// suspenso, o app perde eventos da rede (no Android ela é bloqueada e não volta a avisar): ao voltar
// para o primeiro plano, relê o estado em vez de esperar um evento novo
export function watchNetwork(setOnline: (online: boolean) => void) {
    const refresh = () =>
        Network.getNetworkStateAsync().then(
            (state) => setOnline(isOnline(state)),
            () => setOnline(true)
        );

    const network = Network.addNetworkStateListener((state) => setOnline(isOnline(state)));
    const app = AppState.addEventListener('change', (state) => {
        if (state === 'active') void refresh();
    });
    void refresh();

    return () => {
        network.remove();
        app.remove();
    };
}
