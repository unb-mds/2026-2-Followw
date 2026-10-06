import { cn } from '#/lib/shadcn';

interface FollowwLogoProps {
    className?: string;
    size?: number;
}

export const FollowwLogo: React.FC<FollowwLogoProps> = ({
    size,
    className = size === undefined ? 'size-16' : undefined
}) => (
    <img
        src="/favicon.svg"
        alt="Logo Followw"
        width={size}
        height={size}
        className={cn('object-contain', className)}
    />
);
