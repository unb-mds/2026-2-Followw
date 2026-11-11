import logo from '#/assets/followw.svg?raw';
import { cn } from '#/lib/shadcn';

const src = `data:image/svg+xml,${encodeURIComponent(logo)}`;

interface FollowwLogoProps {
    className?: string;
    size?: number;
}

export const FollowwLogo: React.FC<FollowwLogoProps> = ({
    size,
    className = size === undefined ? 'size-16' : undefined
}) => (
    <img
        src={src}
        alt="Logo Followw"
        width={size}
        height={size}
        className={cn('object-contain', className)}
    />
);
