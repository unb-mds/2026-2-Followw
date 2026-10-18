import { Egg, Leaf } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { RestaurantSelection } from '#/lib/restaurant-share';
import type { MenuSection } from '#/queries/restaurant';

import logo from '#/../public/favicon.svg?raw';
import { highlightMenu, MEAL_TIMES } from '#/lib/restaurant';
import { CAMPUS_LABELS } from '#/queries/restaurant';
import theme from '#/styles.css?raw';

const colors = Object.fromEntries(
    [...theme.matchAll(/--color-share-(\w+):\s*([^;]+);/g)].map(([, key, value]) => [key, value])
);
const column: React.CSSProperties = { display: 'flex', flexDirection: 'column' };
const darkColors = Object.fromEntries(
    [...theme.matchAll(/--color-share-dark-(\w+):\s*([^;]+);/g)].map(([, key, value]) => [
        key,
        value
    ])
);

export function RestaurantShareImage({
    selection,
    sections
}: {
    selection: RestaurantSelection;
    sections: MenuSection[];
}) {
    const palette = selection.theme === 'dark' ? darkColors : colors;
    const alternativeIcons = {
        vegetarian: `data:image/svg+xml;base64,${btoa(renderToStaticMarkup(<Egg size={24} color={palette.primary} />))}`,
        vegan: `data:image/svg+xml;base64,${btoa(renderToStaticMarkup(<Leaf size={24} color={palette.primary} />))}`
    };
    const meal = MEAL_TIMES.find(({ key }) => key === selection.meal)!;
    const { main, alternatives, others } = highlightMenu(sections);
    const date = new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        timeZone: 'UTC'
    }).format(new Date(`${selection.date}T12:00:00Z`));
    const length = sections.reduce((total, section) => total + section.items.join(', ').length, 0);
    const fontSize = length > 750 ? 16 : length > 450 ? 19 : 22;

    return (
        <div
            style={{
                ...column,
                width: '100%',
                height: '100%',
                padding: '36px 48px',
                background: palette.background,
                color: palette.foreground,
                fontFamily: 'DM Sans',
                borderTop: `10px solid ${palette.primary}`
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 24
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <img
                        src={`data:image/svg+xml;base64,${btoa(logo)}`}
                        width={56}
                        height={56}
                        alt=""
                    />
                    <span style={{ fontSize: 36, fontWeight: 700, color: palette.primary }}>
                        Followw
                    </span>
                </div>
                <span style={{ fontSize: 22, color: palette.muted }}>
                    Restaurante Universitário · UnB
                </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <span style={{ fontSize: 44, fontWeight: 700 }}>{meal.label}</span>
                <span style={{ fontSize: 22, color: palette.muted }}>
                    {meal.start}–{meal.end}
                </span>
            </div>
            <div
                style={{
                    display: 'flex',
                    fontSize: 23,
                    color: palette.muted,
                    marginTop: 8,
                    marginBottom: 24
                }}
            >
                {`${date} · ${CAMPUS_LABELS[selection.campus]}`}
            </div>
            {sections.length ? (
                <div style={{ display: 'flex', gap: 24, flex: 1, overflow: 'hidden' }}>
                    {main && (
                        <div
                            style={{
                                ...column,
                                width: '49%',
                                background: palette.highlight,
                                border: `1px solid ${palette.border}`,
                                borderRadius: 16,
                                padding: 24,
                                gap: 12
                            }}
                        >
                            <span style={{ fontSize: 18, color: palette.primary }}>
                                {main.name}
                            </span>
                            <span style={{ fontSize: fontSize + 8, fontWeight: 700 }}>
                                {main.items.join(', ')}
                            </span>
                            {alternatives.map((section) => {
                                const vegetarian = section.key?.endsWith('_vegetarian');
                                return (
                                    <div
                                        key={section.name}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            borderTop: `1px solid ${palette.border}`,
                                            paddingTop: 12,
                                            gap: 12
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                width: 40,
                                                height: 40,
                                                flexShrink: 0,
                                                borderRadius: 12,
                                                background: palette.icon
                                            }}
                                        >
                                            <img
                                                width={24}
                                                height={24}
                                                src={
                                                    vegetarian
                                                        ? alternativeIcons.vegetarian
                                                        : alternativeIcons.vegan
                                                }
                                                alt={
                                                    vegetarian
                                                        ? 'Opção ovolactovegetariana'
                                                        : 'Opção vegetariana estrita'
                                                }
                                            />
                                        </div>
                                        <div style={{ ...column, gap: 4, flex: 1 }}>
                                            <span style={{ fontSize: 16, color: palette.primary }}>
                                                {section.name}
                                            </span>
                                            <span style={{ fontSize: fontSize - 2 }}>
                                                {section.items.join(', ')}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {others.length > 0 && (
                        <div
                            style={{
                                ...column,
                                flex: 1,
                                background: palette.card,
                                borderRadius: 16,
                                gap: others.length > 5 ? 6 : 12,
                                padding: '8px 24px'
                            }}
                        >
                            {others.map((section) => (
                                <div
                                    key={section.name}
                                    style={{
                                        ...column,
                                        gap: 4
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: others.length > 5 ? 12 : 14,
                                            fontWeight: 700,
                                            color: palette.muted
                                        }}
                                    >
                                        {section.name}
                                    </span>
                                    <span
                                        style={{
                                            fontSize: Math.min(
                                                fontSize - 2,
                                                others.length > 5 ? 16 : 20
                                            ),
                                            fontWeight: 600
                                        }}
                                    >
                                        {section.items.join(', ')}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div
                    style={{
                        ...column,
                        flex: 1,
                        justifyContent: 'center',
                        border: `1px solid ${palette.border}`,
                        borderRadius: 16,
                        padding: 32,
                        fontSize: 28,
                        color: palette.muted
                    }}
                >
                    Cardápio não publicado para esta refeição neste dia.
                </div>
            )}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    marginTop: 20,
                    fontSize: 18,
                    color: palette.muted
                }}
            >
                <span style={{ color: palette.primary }}>followw.app/ru</span>
            </div>
        </div>
    );
}
