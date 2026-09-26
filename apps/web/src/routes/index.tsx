import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { AppLayout } from '../components/AppLayout';
import { ClassCard } from '../components/home/ClassCard';
import { LoginPromptCard } from '../components/home/LoginPromptCard';
import { PublicInfoSection } from '../components/home/PublicInfoSection';
import { SemesterProgress } from '../components/home/SemesterProgress';
import { HeaderBar } from '../components/ui/HeaderBar';
import { SectionHeader } from '../components/ui/SectionHeader';
import { classroomsQueryOptions } from '../queries/classrooms';
import { meQueryOptions } from '../queries/me';

export const Route = createFileRoute('/')({
    component: HomePage
});

function HomePage() {
    const [selectedDayIndex, setSelectedDayIndex] = useState(1); // DEZ 2 (Terça) default
    const [showDaysSelector, setShowDaysSelector] = useState(false);
    const [activeLocationModal, setActiveLocationModal] = useState<string | null>(null);

    // Queries
    const { data: user } = useQuery(meQueryOptions);
    const { data: classroomsData } = useQuery({
        ...classroomsQueryOptions,
        enabled: Boolean(user)
    });

    const isLoggedIn = Boolean(user);

    const days = [
        { label: 'DEZ', day: '1', weekday: 'Segunda-feira' },
        { label: 'DEZ', day: '2', weekday: 'Terça-feira' },
        { label: 'DEZ', day: '3', weekday: 'Quarta-feira' },
        { label: 'DEZ', day: '4', weekday: 'Quinta-feira' },
        { label: 'DEZ', day: '5', weekday: 'Sexta-feira' },
        { label: 'DEZ', day: '6', weekday: 'Sábado' }
    ];

    return (
        <AppLayout>
            {/* Top Header Bar with Logo + Hoje Dropdown Toggle */}
            <HeaderBar unreadCount={user ? 2 : 0}>
                <button
                    type="button"
                    onClick={() => setShowDaysSelector(!showDaysSelector)}
                    className="group flex cursor-pointer items-center gap-1 text-left select-none focus:outline-none"
                    title={showDaysSelector ? 'Ocultar seletor de dias' : 'Exibir dias da semana'}
                >
                    <h1 className="text-[30px] leading-none font-bold tracking-tight text-[#243037] transition-colors group-hover:text-[#1EA6A9]">
                        {selectedDayIndex === 1 ? 'Hoje' : days[selectedDayIndex].weekday}
                    </h1>
                    <span
                        className={`material-symbols-outlined text-[26px] text-[#5A686E] transition-transform duration-200 group-hover:text-[#1EA6A9] ${
                            showDaysSelector ? 'rotate-180 text-[#1EA6A9]' : ''
                        }`}
                    >
                        expand_more
                    </span>
                </button>
            </HeaderBar>

            {/* Horizontal Day Carousel */}
            {showDaysSelector && (
                <div className="no-scrollbar mb-5 flex items-center gap-2 overflow-x-auto py-1">
                    {days.map((item, idx) => {
                        const isActive = idx === selectedDayIndex;
                        return (
                            <button
                                key={item.day}
                                type="button"
                                onClick={() => setSelectedDayIndex(idx)}
                                className={`flex h-[66px] w-[54px] min-w-[54px] shrink-0 cursor-pointer flex-col items-center justify-center rounded-2xl transition-all active:scale-95 ${
                                    isActive
                                        ? 'bg-[#1EA6A9] text-white shadow-md shadow-[#1EA6A9]/30'
                                        : 'border border-[#E4E7E7] bg-white/80 text-[#5A686E] hover:bg-white'
                                }`}
                            >
                                <span
                                    className={`text-[10px] font-bold tracking-wider uppercase ${
                                        isActive ? 'text-white/90' : 'text-[#8b9c9c]'
                                    }`}
                                >
                                    {item.label}
                                </span>
                                <span
                                    className={`text-[18px] font-extrabold ${
                                        isActive ? 'text-white' : 'text-[#243037]'
                                    }`}
                                >
                                    {item.day}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Section: Aulas do Dia */}
            <SectionHeader
                title="Aulas do Dia"
                badge={
                    isLoggedIn && classroomsData
                        ? `${classroomsData.length} disciplinas`
                        : '3 disciplinas'
                }
            />

            {!isLoggedIn && (
                <div className="mb-4">
                    <LoginPromptCard />
                </div>
            )}

            {/* Daily Classes List */}
            <div className="flex flex-col gap-1">
                {isLoggedIn && classroomsData && classroomsData.length > 0 ? (
                    classroomsData.map((cls: any, index: number) => (
                        <ClassCard
                            key={cls.id || index}
                            title={cls.subject?.name || cls.name || 'Disciplina'}
                            code={cls.subject?.code || cls.number}
                            time={cls.schedule || '10:00 - 11:50'}
                            location={cls.room || 'Predio Central / Lab'}
                            professor={cls.professor || 'Docente UnB'}
                            status={index === 0 ? 'in_progress' : index === 1 ? 'next' : 'normal'}
                            accentColor={
                                index === 0 ? '#06D764' : index === 1 ? '#1EA6A9' : '#e08a00'
                            }
                            onLocationClick={() =>
                                setActiveLocationModal(
                                    `${cls.room || 'ICC Sul'} (Campus Darcy Ribeiro)`
                                )
                            }
                        />
                    ))
                ) : (
                    <>
                        <ClassCard
                            title="Requisitos de Software"
                            code="FGA0158"
                            time="10:00 - 11:50"
                            location="ICC Sul • Sala CSS-042"
                            professor="Prof. Dr. André Lanna"
                            status="in_progress"
                            accentColor="#06D764"
                            onLocationClick={() =>
                                setActiveLocationModal(
                                    'ICC Sul • Sala CSS-042 (Campus Darcy Ribeiro - Ala Sul)'
                                )
                            }
                        />
                        <ClassCard
                            title="Estruturas de Dados 2"
                            code="CIC0169"
                            time="14:00 - 15:50"
                            location="BSA Norte • Laboratório 03"
                            professor="Profª. Carla Castanho"
                            status="next"
                            accentColor="#1EA6A9"
                            onLocationClick={() =>
                                setActiveLocationModal(
                                    'BSA Norte • Bloco de Salas de Aula Norte (Lab 03)'
                                )
                            }
                        />
                        <ClassCard
                            title="Cálculo 3"
                            code="MAT0027"
                            time="16:00 - 17:50"
                            location="PAT • Auditório 02"
                            professor="Departamento de Matemática"
                            status="warning"
                            statusText="Atenção: 4 faltas"
                            accentColor="#e08a00"
                            onLocationClick={() =>
                                setActiveLocationModal(
                                    'PAT • Pavilhão Anísio Teixeira (Auditório 02)'
                                )
                            }
                        />
                    </>
                )}
            </div>

            {/* Progress Card */}
            <SemesterProgress daysRemaining={42} percentage={68} />

            {/* Public Info Section */}
            <PublicInfoSection />

            {/* Location Map Modal */}
            {activeLocationModal && (
                <div className="animate-fadeIn fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
                    <div className="flex w-full max-w-[340px] flex-col gap-3 rounded-3xl border border-gray-100 bg-white p-5 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[#007080]">
                                <span className="material-symbols-outlined text-[22px]">
                                    navigation
                                </span>
                                <span className="text-[15px] font-bold">Localização na UnB</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setActiveLocationModal(null)}
                                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-[#5A686E] transition hover:bg-gray-100"
                            >
                                <span className="material-symbols-outlined text-[18px]">close</span>
                            </button>
                        </div>

                        <p className="text-[13.5px] font-semibold text-[#243037]">
                            {activeLocationModal}
                        </p>

                        <div className="flex h-32 flex-col items-center justify-center rounded-2xl border border-[#1EA6A9]/20 bg-[#E6FAF5] p-3 text-center text-[#007080]">
                            <span className="material-symbols-outlined mb-1 text-[32px] text-[#1EA6A9]">
                                map
                            </span>
                            <span className="text-[12px] font-semibold text-[#007080]">
                                Traçado de rotas internas ativado
                            </span>
                            <span className="text-[10.5px] text-[#5A686E]">
                                Acesso por rampas e elevadores acessíveis
                            </span>
                        </div>

                        <button
                            type="button"
                            onClick={() => setActiveLocationModal(null)}
                            className="w-full cursor-pointer rounded-xl bg-[#1EA6A9] py-2.5 text-[13px] font-bold text-white transition hover:bg-[#007080]"
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            )}
        </AppLayout>
    );
}
