import React from 'react';

import { Card } from '../ui/Card';

export interface ClassCardProps {
    title: string;
    code?: string;
    time: string;
    location: string;
    professor?: string;
    status?: 'in_progress' | 'next' | 'normal' | 'warning';
    statusText?: string;
    accentColor?: string;
    onLocationClick?: () => void;
    onClick?: () => void;
}

export const ClassCard: React.FC<ClassCardProps> = ({
    title,
    code,
    time,
    location,
    professor,
    status = 'normal',
    statusText,
    accentColor = '#1EA6A9',
    onLocationClick,
    onClick
}) => {
    return (
        <Card accentColor={accentColor} onClick={onClick} className="mb-3">
            <div className="mb-1 flex items-start justify-between gap-2 pl-1">
                <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-[#2B7A56]">{time}</span>
                    {status === 'in_progress' && (
                        <span className="flex items-center gap-1 rounded-full bg-[#C2EDDA]/50 px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#2B7A56] uppercase">
                            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-[#06D764]" />
                            {statusText || 'Em andamento'}
                        </span>
                    )}
                    {status === 'next' && (
                        <span className="text-[11px] font-semibold text-[#5A686E]">
                            {statusText || 'Próxima'}
                        </span>
                    )}
                    {status === 'warning' && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-amber-800 uppercase">
                            {statusText || 'Atenção'}
                        </span>
                    )}
                </div>
                {code && (
                    <span className="text-[11px] font-semibold tracking-wider text-[#5A686E] uppercase">
                        {code}
                    </span>
                )}
            </div>

            <div className="mb-2 pl-1">
                <h3 className="cursor-pointer text-[16px] font-bold text-[#243037] transition-colors hover:text-[#1EA6A9]">
                    {title}
                </h3>
                {professor && <p className="mt-0.5 text-[12.5px] text-[#5A686E]">{professor}</p>}
            </div>

            <div className="flex items-center justify-between border-t border-[#E4E7E7]/60 pt-2 pl-1">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#5A686E]">
                    <span className="material-symbols-outlined text-[17px] text-[#1EA6A9]">
                        location_on
                    </span>
                    <span>{location}</span>
                </div>
                {onLocationClick && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onLocationClick();
                        }}
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[#E4E7E7] bg-[#F5FAFF] text-[#5A686E] transition hover:text-[#1EA6A9] active:scale-95"
                        title="Ver mapa da sala"
                    >
                        <span className="material-symbols-outlined text-[18px]">map</span>
                    </button>
                )}
            </div>
        </Card>
    );
};
