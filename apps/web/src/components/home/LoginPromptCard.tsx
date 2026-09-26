import { Link } from '@tanstack/react-router';

import { Card } from '#/components/ui/Card';

interface LoginPromptCardProps {
    onLoginClick?: () => void;
}

export const LoginPromptCard: React.FC<LoginPromptCardProps> = ({ onLoginClick }) => {
    return (
        <Card className="border-line bg-white p-5 shadow-sm">
            <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary-light p-0.5 text-primary shadow-sm">
                    <span className="material-symbols-outlined text-2xl">lock</span>
                </div>

                <div className="flex-1">
                    <h3 className="text-lg font-bold tracking-tight text-ink">
                        Acesse com sua Matrícula UnB
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted">
                        Conecte-se com as credenciais do SIGAA para visualizar suas turmas, horários
                        e notas em tempo real.
                    </p>

                    <div className="mt-4 flex items-center gap-3">
                        <Link
                            to="/perfil"
                            onClick={onLoginClick}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-primary-dark active:scale-95"
                        >
                            <span>Entrar com SIGAA</span>
                            <span className="material-symbols-outlined text-lg">arrow_forward</span>
                        </Link>
                    </div>
                </div>
            </div>
        </Card>
    );
};
