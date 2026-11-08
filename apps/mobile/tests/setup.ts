const mockMemory = new Map<string, Map<string, string>>();

jest.mock('react-native-mmkv', () => ({
    createMMKV: ({ id }: { id: string }) => {
        const store = mockMemory.get(id) ?? new Map<string, string>();
        mockMemory.set(id, store);
        return {
            getString: (key: string) => store.get(key),
            set: (key: string, value: string) => store.set(key, value),
            remove: (key: string) => store.delete(key),
            clearAll: () => store.clear()
        };
    }
}));

jest.mock('expo-secure-store', () => {
    const store = new Map<string, string>();
    return {
        AFTER_FIRST_UNLOCK: 0,
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        deleteItemAsync: async (key: string) => store.delete(key)
    };
});
