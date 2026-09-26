import React from 'react';

import { Card } from '#/components/ui/Card';

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
    accentColor = 'var(--color-primary)',
    onLocationClick,
    onClick
}) => {
    return (
        <Card accentColor={accentColor} onClick={onClick} className="mb-3">
            <div className="mb-1 flex items-start justify-between gap-2 pl-1">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-success">{time}</span>
                    {status === 'in_progress' && (
                        <span className="flex items-center gap-1 rounded-full bg-mint-light/50 px-2 py-0.5 text-xs font-bold tracking-wider text-success uppercase">
                            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-live" />
                            {statusText || 'Em andamento'}
                        </span>
                    )}
                    {status === 'next' && (
                        <span className="text-xs font-semibold text-muted">
                            {statusText || 'Próxima'}
                        </span>
                    )}
                    {status === 'warning' && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold tracking-wider text-amber-800 uppercase">
                            {statusText || 'Atenção'}
                        </span>
                    )}
                </div>
                {code && (
                    <span className="text-xs font-semibold tracking-wider text-muted uppercase">
                        {code}
                    </span>
                )}
            </div>

            <div className="mb-2 pl-1">
                <h3 className="cursor-pointer text-base font-bold text-ink transition-colors hover:text-primary">
                    {title}
                </h3>
                {professor && <p className="mt-0.5 text-xs text-muted">{professor}</p>}
            </div>

            <div className="flex items-center justify-between border-t border-line/60 pt-2 pl-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
                    <span className="material-symbols-outlined text-lg text-primary">
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
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface text-muted transition hover:text-primary active:scale-95"
                        title="Ver mapa da sala"
                    >
                        <span className="material-symbols-outlined text-lg">map</span>
                    </button>
                )}
            </div>
        </Card>
    );
};
