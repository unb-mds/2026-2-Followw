import { LoadingText } from '#/components/LoadingText';

// tela de carregamento das rotas, como o loading.tsx do Next
export const PendingPage: React.FC = () => (
    <div className="flex flex-1 items-center justify-center py-24 text-sm text-muted-foreground">
        <LoadingText>Carregando...</LoadingText>
    </div>
);
