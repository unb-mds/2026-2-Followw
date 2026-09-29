import { createContext, useContext, useMemo, useState } from 'react';

interface PageStateValues {
    // home
    week: boolean;
    date: string | null;
    // ru
    filters: boolean;
}

type Values = Partial<PageStateValues>;

const PageStateContext = createContext<
    readonly [Values, React.Dispatch<React.SetStateAction<Values>>] | null
>(null);

interface PageStateProviderProps {
    page: string;
    children: React.ReactNode;
}

// estado que o header divide com a página; zera ao trocar de página
export const PageStateProvider: React.FC<PageStateProviderProps> = ({ page, children }) => {
    const [values, setValues] = useState<Values>({});
    const [currentPage, setCurrentPage] = useState(page);
    if (currentPage !== page) {
        setCurrentPage(page);
        setValues({});
    }
    const context = useMemo(() => [values, setValues] as const, [values]);

    return <PageStateContext.Provider value={context}>{children}</PageStateContext.Provider>;
};

export function usePageState<K extends keyof PageStateValues>(key: K, initial: PageStateValues[K]) {
    const context = useContext(PageStateContext);
    if (!context) throw new Error('usePageState precisa estar dentro de um PageStateProvider');

    const [values, setValues] = context;
    const setValue = (next: PageStateValues[K]) => setValues((prev) => ({ ...prev, [key]: next }));
    return [values[key] ?? initial, setValue] as const;
}
