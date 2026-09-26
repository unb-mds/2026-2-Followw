import React, { useId, useMemo } from 'react';

export interface LiquidGlassProps {
    width: number;
    height: number;
    /** Defaults to height/2 (pill shape) */
    radius?: number;
    /** Negative = magnifying (Apple-style). Range: -20 (subtle) to -50 (dramatic). Default: -35 */
    scale?: number;
    /** Backdrop blur radius in px. Default: 20 */
    blur?: number;
    /** Glass tint color. Default: rgba(255,255,255,0.15) */
    tint?: string;
    className?: string;
    style?: React.CSSProperties;
    children?: React.ReactNode;
}

/** Builds an inline SVG gradient displacement map data URI producing edge-only refraction. */
function buildDisplacementMapUri(width: number, height: number, radius: number): string {
    const blur = Math.max(5, Math.round(radius * 0.35));
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'>
  <defs>
    <linearGradient id='gx' x1='0%' y1='0%' x2='100%' y2='0%'>
      <stop offset='0%' stop-color='#000'/>
      <stop offset='100%' stop-color='#f00'/>
    </linearGradient>
    <linearGradient id='gy' x1='0%' y1='0%' x2='0%' y2='100%'>
      <stop offset='0%' stop-color='#000'/>
      <stop offset='100%' stop-color='#0f0'/>
    </linearGradient>
    <filter id='b'><feGaussianBlur stdDeviation='${blur}'/></filter>
  </defs>
  <rect width='${width}' height='${height}' rx='${radius}' fill='url(#gx)' style='mix-blend-mode:screen'/>
  <rect width='${width}' height='${height}' rx='${radius}' fill='url(#gy)' style='mix-blend-mode:screen'/>
  <rect width='${width}' height='${height}' rx='${radius}' fill='#808080' filter='url(#b)'/>
</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** True for Chrome/Edge (Chromium). SVG url() in backdrop-filter is Chromium-only. */
function supportsBackdropSvgFilter(): boolean {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent;
    return /Chrome\//.test(ua) || /Edg\//.test(ua);
}

export const LiquidGlass: React.FC<LiquidGlassProps> = ({
    width,
    height,
    radius,
    scale = -35,
    blur = 20,
    tint = 'rgba(255,255,255,0.15)',
    className,
    style,
    children,
}) => {
    const resolvedRadius = radius ?? Math.round(height / 2);
    const uid = useId();
    const filterId = `lg-${uid.replace(/:/g, '')}`;

    const mapHref = useMemo(
        () => buildDisplacementMapUri(width, height, resolvedRadius),
        [width, height, resolvedRadius],
    );

    const isChrome = useMemo(() => supportsBackdropSvgFilter(), []);

    const backdropFilter = isChrome
        ? `blur(${blur}px) url(#${filterId}) brightness(1.04) saturate(1.4)`
        : `blur(${blur}px) brightness(1.04) saturate(1.3)`;

    return (
        <>
            {/* Hidden SVG filter — component-scoped, unique ID via useId */}
            {isChrome && (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width={0}
                    height={0}
                    style={{ position: 'absolute', overflow: 'hidden' }}
                    aria-hidden="true"
                >
                    <defs>
                        <filter
                            id={filterId}
                            colorInterpolationFilters="sRGB"
                            x="0%"
                            y="0%"
                            width="100%"
                            height="100%"
                        >
                            <feImage
                                result="dispMap"
                                x={0}
                                y={0}
                                width={width}
                                height={height}
                                preserveAspectRatio="none"
                                href={mapHref}
                            />
                            <feDisplacementMap
                                in="SourceGraphic"
                                in2="dispMap"
                                scale={scale}
                                xChannelSelector="R"
                                yChannelSelector="G"
                            />
                        </filter>
                    </defs>
                </svg>
            )}

            <div
                className={className}
                style={{
                    position: 'relative',
                    width,
                    height,
                    borderRadius: resolvedRadius,
                    overflow: 'hidden',
                    ...style,
                }}
            >
                {/* Layer 0: Refraction */}
                <div
                    aria-hidden="true"
                    style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: 'inherit',
                        backdropFilter,
                        WebkitBackdropFilter: backdropFilter,
                        isolation: 'isolate',
                    }}
                />
                {/* Layer 1: Tint */}
                <div
                    aria-hidden="true"
                    style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: 'inherit',
                        background: tint,
                    }}
                />
                {/* Layer 2: Specular rim highlight */}
                <div
                    aria-hidden="true"
                    style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: 'inherit',
                        boxShadow: [
                            'inset 0  1px 0 rgba(255,255,255,0.80)',
                            'inset 0 -1px 0 rgba(255,255,255,0.18)',
                            'inset  1px 0 0 rgba(255,255,255,0.22)',
                            'inset -1px 0 0 rgba(255,255,255,0.22)',
                        ].join(', '),
                    }}
                />
                {/* Layer 3: Content */}
                <div style={{ position: 'relative', zIndex: 10, height: '100%' }}>
                    {children}
                </div>
            </div>
        </>
    );
};
