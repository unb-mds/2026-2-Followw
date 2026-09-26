import { createFileRoute } from '@tanstack/react-router';
import React, { useState } from 'react';

import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/ui/Card';
import { HeaderBar } from '../components/ui/HeaderBar';

export const Route = createFileRoute('/perfil')({
    component: PerfilPage
});

function PerfilPage() {
    const [registration, setRegistration] = useState('');
    const [password, setPassword] = useState('');

    return (
        <AppLayout>
            <HeaderBar />
            <div className="space-y-4">
                <Card className="p-6">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[#1EA6A9]/20 bg-[#E6FAF5] text-[#1EA6A9]">
                        <span className="material-symbols-outlined text-[28px]">person</span>
                    </div>
                    <h3 className="mb-1 text-center text-[18px] font-bold text-[#243037]">
                        Entrar no Followw
                    </h3>
                    <p className="mb-5 text-center text-[12.5px] text-[#5A686E]">
                        Utilize sua matrícula e senha do SIGAA. Sua sessão é protegida por cookies
                        cifrados.
                    </p>

                    <form onSubmit={(e) => e.preventDefault()} className="space-y-3">
                        <div>
                            <label
                                htmlFor="registration"
                                className="mb-1 block text-[12px] font-bold text-[#243037]"
                            >
                                Matrícula
                            </label>
                            <input
                                id="registration"
                                type="text"
                                value={registration}
                                onChange={(e) => setRegistration(e.target.value)}
                                placeholder="ex: 211000000"
                                className="w-full rounded-xl border border-[#E4E7E7] bg-white px-3.5 py-2.5 text-[14px] text-[#243037] placeholder-[#8b9c9c] transition focus:border-[#1EA6A9] focus:outline-none"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="password"
                                className="mb-1 block text-[12px] font-bold text-[#243037]"
                            >
                                Senha do SIGAA
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full rounded-xl border border-[#E4E7E7] bg-white px-3.5 py-2.5 text-[14px] text-[#243037] placeholder-[#8b9c9c] transition focus:border-[#1EA6A9] focus:outline-none"
                            />
                        </div>

                        <button
                            type="submit"
                            className="mt-2 w-full cursor-pointer rounded-xl bg-[#1EA6A9] py-3 text-[14px] font-bold text-white shadow-md transition hover:bg-[#007080] active:scale-95"
                        >
                            Conectar Conta
                        </button>
                    </form>
                </Card>
            </div>
        </AppLayout>
    );
}
