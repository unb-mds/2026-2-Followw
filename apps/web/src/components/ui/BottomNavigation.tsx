import { Link, useLocation } from '@tanstack/react-router';
import React from 'react';

import { LiquidGlass } from './LiquidGlass';

interface NavItem {
    to: '/' | '/turmas' | '/ru' | '/perfil';
    label: string;
    icon: string;
}

const navItems: NavItem[] = [
    { to: '/', label: 'Início', icon: 'home' },
    { to: '/turmas', label: 'Turmas', icon: 'search' },
    { to: '/ru', label: 'RU', icon: 'restaurant' },
    { to: '/perfil', label: 'Perfil', icon: 'person' },
];

const BAR_W = 296;
const BAR_H = 58;
const BAR_PADDING_X = 10; // px-2.5

const BUBBLE_W = 52;
const BUBBLE_H = 44;
const SLOT_W = (BAR_W - BAR_PADDING_X * 2) / navItems.length; // 276 / 4 = 69
const BUBBLE_LEFT = BAR_PADDING_X + (SLOT_W - BUBBLE_W) / 2; // 18.5
const BUBBLE_TOP = (BAR_H - BUBBLE_H) / 2; // 7

export const BottomNavigation: React.FC = () => {
    const location = useLocation();
    const activeIndex = navItems.findIndex((item) => item.to === location.pathname);

    return (
        <nav
            className="fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 select-none"
            style={{
                filter: 'drop-shadow(0 12px 28px rgba(0,36,40,0.28)) drop-shadow(0 4px 8px rgba(0,0,0,0.12))',
            }}
            aria-label="Navegação principal do aplicativo"
        >
            <LiquidGlass width={BAR_W} height={BAR_H} scale={-30} blur={28} tint="rgba(30,166,169,0.08)">
                {/* Sliding glass bubble — single element, translates to active slot */}
                <div
                    aria-hidden="true"
                    style={{
                        position: 'absolute',
                        left: BUBBLE_LEFT,
                        top: BUBBLE_TOP,
                        width: BUBBLE_W,
                        height: BUBBLE_H,
                        borderRadius: BUBBLE_H / 2,
                        overflow: 'hidden',
                        transform: `translateX(${activeIndex * SLOT_W}px)`,
                        // Spring curve: slight overshoot for a lively feel
                        transition: 'transform 0.4s cubic-bezier(0.34, 1.4, 0.64, 1)',
                        zIndex: 1,
                    }}
                >
                    {/* Nested glass layers — lighter blur, bright tint (glass-on-glass) */}
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: 'inherit',
                            backdropFilter: 'blur(8px) brightness(1.18)',
                            WebkitBackdropFilter: 'blur(8px) brightness(1.18)',
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: 'inherit',
                            background: 'rgba(255,255,255,0.88)',
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: 'inherit',
                            boxShadow: [
                                'inset 0  1px 0 rgba(255,255,255,1.00)',
                                'inset 0 -1px 0 rgba(255,255,255,0.35)',
                                'inset  1px 0 0 rgba(255,255,255,0.30)',
                                'inset -1px 0 0 rgba(255,255,255,0.30)',
                            ].join(', '),
                        }}
                    />
                </div>

                {/* Tab items */}
                <div className="relative flex h-full w-full items-center justify-around px-2.5" style={{ zIndex: 2 }}>
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.to;
                        return (
                            <Link
                                key={item.to}
                                to={item.to}
                                className="relative flex cursor-pointer items-center justify-center active:scale-90"
                                style={{ width: BUBBLE_W, height: BUBBLE_H, transition: 'transform 0.15s ease' }}
                                aria-label={item.label}
                                aria-current={isActive ? 'page' : undefined}
                            >
                                <span
                                    className="material-symbols-outlined"
                                    style={{
                                        fontSize: 23,
                                        color: isActive ? '#007080' : '#486267',
                                        fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                                        transform: isActive ? 'scale(1.1)' : 'scale(1)',
                                        transition: 'color 0.35s ease, transform 0.35s ease',
                                    }}
                                >
                                    {item.icon}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </LiquidGlass>
        </nav>
    );
};
