import { MapIcon, MapPin } from 'lucide-react';

import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import { Card, CardContent, CardHeader } from '#/components/ui/card';

export interface ClassCardProps {
    title: string;
    code?: string;
    time: string;
    location: string;
    professor?: string;
    status?: 'in_progress' | 'next' | 'normal' | 'warning';
    statusText?: string;
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
    onLocationClick,
    onClick
}) => {
    return (
        <Card className="relative border-l-4 border-l-primary">
            {onClick && (
                <Button
                    variant="ghost"
                    onClick={onClick}
                    aria-label={title}
                    className="absolute inset-0 h-full w-full rounded-xl hover:bg-primary/5"
                />
            )}
            <CardHeader className="pointer-events-none relative">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-primary">{time}</span>
                        {status === 'in_progress' && (
                            <Badge variant="secondary">
                                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                                {statusText || 'Em andamento'}
                            </Badge>
                        )}
                        {status === 'next' && (
                            <Badge variant="outline">{statusText || 'Próxima'}</Badge>
                        )}
                        {status === 'warning' && (
                            <Badge variant="destructive">{statusText || 'Atenção'}</Badge>
                        )}
                    </div>
                    {code && (
                        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                            {code}
                        </span>
                    )}
                </div>
                <h3 className="text-base font-bold text-foreground">{title}</h3>
                {professor && <p className="text-xs text-muted-foreground">{professor}</p>}
            </CardHeader>
            <CardContent className="pointer-events-none relative">
                <div className="flex items-center justify-between border-t border-border pt-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <MapPin className="size-4 text-primary" />
                        <span>{location}</span>
                    </div>
                    {onLocationClick && (
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={(e) => {
                                e.stopPropagation();
                                onLocationClick();
                            }}
                            className="pointer-events-auto text-muted-foreground"
                            title="Ver mapa da sala"
                            aria-label="Ver mapa da sala"
                        >
                            <MapIcon className="size-4" />
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};
