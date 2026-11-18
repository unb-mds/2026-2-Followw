import logo from '#/assets/followw.svg?raw';
import { cn } from '#/lib/shadcn';

const src = `data:image/svg+xml,${encodeURIComponent(logo)}`;

interface FollowwLogoProps {
    className?: string;
}

export const FollowwLogo: React.FC<FollowwLogoProps> = ({ className = 'size-16' }) => (
    <img src={src} alt="Logo Followw" className={cn('object-contain', className)} />
);
