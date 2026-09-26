import React from 'react';

interface FollowwLogoProps {
    className?: string;
    size?: number;
}

export const FollowwLogo: React.FC<FollowwLogoProps> = ({
    className = 'w-16 h-11',
    size,
}) => {
    return (
        <svg
            viewBox="0 0 1000 650"
            width={size}
            height={size ? (size * 650) / 1000 : undefined}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            aria-label="Logo Followw"
        >
            {/* Left Half */}
            <g>
                {/* Top-Left Shape (Teal) */}
                <path
                    d="M 475 20
                       L 120 20
                       A 95 95 0 0 0 25 115
                       L 25 395
                       C 110 415, 200 375, 305 285
                       C 385 215, 445 125, 475 20 Z"
                    fill="var(--color-logo-teal)"
                />

                {/* Bottom-Left Shape (Emerald Green) */}
                <path
                    d="M 475 165
                       L 475 630
                       L 120 630
                       A 95 95 0 0 1 25 535
                       L 25 470
                       C 115 488, 215 448, 315 362
                       C 395 292, 450 220, 475 165 Z"
                    fill="var(--color-logo-green)"
                />
            </g>

            {/* Right Half (Mirrored) */}
            <g>
                {/* Top-Right Shape (Teal) */}
                <path
                    d="M 525 20
                       L 880 20
                       A 95 95 0 0 1 975 115
                       L 975 395
                       C 890 415, 800 375, 695 285
                       C 615 215, 555 125, 525 20 Z"
                    fill="var(--color-logo-teal)"
                />

                {/* Bottom-Right Shape (Emerald Green) */}
                <path
                    d="M 525 165
                       L 525 630
                       L 880 630
                       A 95 95 0 0 0 975 535
                       L 975 470
                       C 885 488, 785 448, 685 362
                       C 605 292, 550 220, 525 165 Z"
                    fill="var(--color-logo-green)"
                />
            </g>
        </svg>
    );
};
