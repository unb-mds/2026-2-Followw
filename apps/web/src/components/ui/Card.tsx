
interface CardProps {
    children: React.ReactNode;
    className?: string;
    accentColor?: string;
    onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
    children,
    className = '',
    accentColor,
    onClick,
}) => {
    return (
        <article
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onKeyDown={(e) => {
                if (onClick && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onClick();
                }
            }}
            className={`relative bg-white rounded-2xl p-4 shadow-sm border border-line overflow-hidden transition-all duration-200 ${
                onClick ? 'cursor-pointer hover:border-primary hover:shadow-md active:scale-99' : ''
            } ${className}`}
        >
            {accentColor && (
                <div
                    className="absolute left-0 top-0 bottom-0 w-1.5"
                    style={{ backgroundColor: accentColor }}
                />
            )}
            {children}
        </article>
    );
};
