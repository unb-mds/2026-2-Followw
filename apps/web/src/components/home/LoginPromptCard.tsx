import { Link } from '@tanstack/react-router';
import React from 'react';

import { Card } from '../ui/Card';

interface LoginPromptCardProps {
    onLoginClick?: () => void;
}

export const LoginPromptCard: React.FC<LoginPromptCardProps> = ({ onLoginClick }) => {
    return (
        <Card className="border-[#E4E7E7] bg-white p-5 shadow-sm">
            <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#1EA6A9]/30 bg-[#E6FAF5] p-0.5 text-[#1EA6A9] shadow-sm">
                    <span className="material-symbols-outlined text-[26px]">lock</span>
                </div>

                <div className="flex-1">
                    <h3 className="text-[17px] font-bold tracking-tight text-[#243037]">
                        Acesse com sua Matrícula UnB
                    </h3>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[#5A686E]">
                        Conecte-se com as credenciais do SIGAA para visualizar suas turmas, horários
                        e notas em tempo real.
                    </p>

                    <div className="mt-4 flex items-center gap-3">
                        <Link
                            to="/perfil"
                            onClick={onLoginClick}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#1EA6A9] px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition-all hover:bg-[#007080] active:scale-95"
                        >
                            <span>Entrar com SIGAA</span>
                            <span className="material-symbols-outlined text-[18px]">
                                arrow_forward
                            </span>
                        </Link>
                    </div>
                </div>
            </div>
        </Card>
    );
};
