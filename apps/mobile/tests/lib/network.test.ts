import { AppState, type AppStateStatus } from 'react-native';

import { watchNetwork } from '@/lib/network';

const network = { isConnected: true };
let emit: (state: { isConnected: boolean }) => void;

jest.mock('expo-network', () => ({
    getNetworkStateAsync: jest.fn(async () => network),
    addNetworkStateListener: (listener: typeof emit) => {
        emit = listener;
        return { remove: jest.fn() };
    }
}));

let changeApp: (state: AppStateStatus) => void;
const removeApp = jest.fn();
jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    changeApp = listener;
    return { remove: removeApp };
});

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => {
    network.isConnected = true;
});

test('volta a ficar online ao retomar o app sem evento novo da rede', async () => {
    const setOnline = jest.fn();
    watchNetwork(setOnline);
    await flush();

    emit({ isConnected: false });
    changeApp('background');
    expect(setOnline).toHaveBeenLastCalledWith(false);

    changeApp('active');
    await flush();
    expect(setOnline).toHaveBeenLastCalledWith(true);
});

test('continua offline ao retomar sem conexão', async () => {
    const setOnline = jest.fn();
    watchNetwork(setOnline);
    network.isConnected = false;

    changeApp('active');
    await flush();
    expect(setOnline).toHaveBeenLastCalledWith(false);
});

test('lê o estado da rede ao iniciar', async () => {
    network.isConnected = false;
    const setOnline = jest.fn();
    watchNetwork(setOnline);
    await flush();
    expect(setOnline).toHaveBeenCalledWith(false);
});

test('para de ouvir a rede e o app ao cancelar', () => {
    watchNetwork(jest.fn())();
    expect(removeApp).toHaveBeenCalled();
});
