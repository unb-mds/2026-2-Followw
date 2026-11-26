import type { RestaurantSelection } from '@followw/core/lib/restaurant.ts';
import type { MenuSection } from '@followw/core/queries/restaurant.ts';

import {
    highlightMenu,
    MEAL_TIMES,
    groupSalads,
    renameSections
} from '@followw/core/lib/restaurant.ts';
import { CAMPUS_LABELS } from '@followw/core/queries/restaurant.ts';
import { Leaf, type LucideIcon, UtensilsCrossed } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';

import logo from '#/assets/followw.svg?raw';
import { ALTERNATIVES, SECTION_ICONS } from '#/components/ru/menu-icons';

// Tema da prévia compartilhada.
const THEME: 'light' | 'dark' = 'dark';

const PALETTES = {
    light: {
        background: '#ffffff',
        foreground: '#171717',
        primary: '#007c5d',
        muted: '#737373',
        highlight: '#f2f8f6',
        highlightBorder: '#b3d8cc',
        highlightDivider: '#d9ebe5',
        icon: '#e5f2ed',
        card: '#f7f7f7',
        divider: '#ebebeb'
    },
    dark: {
        background: '#151515',
        foreground: '#f5f5f5',
        primary: '#5fceaa',
        muted: '#a3a3a3',
        highlight: '#18211e',
        highlightBorder: '#2f5246',
        highlightDivider: '#24352f',
        icon: '#1f3a30',
        card: '#1f1f1f',
        divider: '#2c2c2c'
    }
};
const column: React.CSSProperties = { display: 'flex', flexDirection: 'column' };

const shareDateFormat = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    timeZone: 'UTC'
});

// Área útil do cardápio em 1200x630, descontados cabeçalho, título e rodapé.
const CONTENT_WIDTH = 1104;
const CONTENT_HEIGHT = 340;
const GAP = 24;

// DM Sans tem largura média perto de meia fonte; arredonda para cima para não cortar.
function lineCount(text: string, width: number, fontSize: number) {
    return Math.max(1, Math.ceil((text.length * fontSize * 0.54) / width));
}

function truncate(text: string, max: number) {
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// Maior fonte em que a lista cabe; com muitas seções, passa para duas colunas.
function listLayout(sections: MenuSection[], width: number) {
    const texts = sections.map((section) => section.items.join(', '));
    for (const columns of [1, 2]) {
        const textWidth = width / columns - 36 - 20 - 14;
        for (const fontSize of [20, 19, 18, 17, 16, 15, 14]) {
            const heights = texts.map(
                (text) => 42 + lineCount(text, textWidth, fontSize) * fontSize * 1.3
            );
            let height = 0;
            for (let row = 0; row < heights.length; row += columns) {
                height += Math.max(...heights.slice(row, row + columns)) + 1;
            }
            if (height <= CONTENT_HEIGHT) return { columns, fontSize, texts };
        }
    }
    // nem assim cabe: corta cada seção em duas linhas
    const fontSize = 14;
    const perLine = Math.floor((width / 2 - 70) / (fontSize * 0.54));
    return { columns: 2, fontSize, texts: texts.map((text) => truncate(text, perLine * 2)) };
}

function highlightLayout(main: MenuSection, alternatives: MenuSection[], width: number) {
    const textWidth = width - 48;
    const altWidth = textWidth - 36 - 14;
    for (const [mainSize, altSize] of [
        [32, 18],
        [28, 18],
        [26, 17],
        [24, 16],
        [22, 15]
    ]) {
        const mainHeight = main.items.reduce(
            (total, item) => total + lineCount(item, textWidth, mainSize) * mainSize * 1.2,
            48 + 18 + 8
        );
        const altHeight = alternatives.reduce(
            (total, section) =>
                total +
                28 +
                Math.max(
                    36,
                    16 + lineCount(section.items.join(', '), altWidth, altSize) * altSize * 1.3
                ),
            0
        );
        if (mainHeight + altHeight <= CONTENT_HEIGHT) return { mainSize, altSize, clamp: false };
    }
    return { mainSize: 22, altSize: 15, clamp: true };
}

export function RestaurantShareImage({
    selection,
    sections
}: {
    selection: RestaurantSelection;
    sections: MenuSection[];
}) {
    const palette = PALETTES[THEME];
    const icon = (Icon: LucideIcon, size: number) =>
        `data:image/svg+xml;base64,${btoa(renderToStaticMarkup(<Icon size={size} color={palette.primary} />))}`;
    const meal = MEAL_TIMES.find(({ key }) => key === selection.meal)!;
    const { main, alternatives, others: ungrouped } = highlightMenu(sections);
    const others = groupSalads(renameSections(ungrouped));
    const date = shareDateFormat.format(new Date(`${selection.date}T12:00:00Z`));

    const split = main && others.length > 0;
    const highlightWidth = split ? Math.round((CONTENT_WIDTH - GAP) * 0.46) : CONTENT_WIDTH;
    const listWidth = split ? CONTENT_WIDTH - GAP - highlightWidth : CONTENT_WIDTH;
    const list = listLayout(others, listWidth);
    const highlight = main && highlightLayout(main, alternatives, highlightWidth);

    return (
        <div
            style={{
                ...column,
                width: '100%',
                height: '100%',
                padding: '32px 48px',
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
                    marginBottom: 20
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <img
                        src={`data:image/svg+xml;base64,${btoa(logo)}`}
                        width={44}
                        height={44}
                        alt=""
                    />
                    <span style={{ fontSize: 32, fontWeight: 700, color: palette.primary }}>
                        Followw
                    </span>
                </div>
                <span style={{ fontSize: 20, color: palette.muted }}>
                    Restaurante Universitário · UnB
                </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <span style={{ fontSize: 42, fontWeight: 700 }}>{meal.label}</span>
                <span style={{ fontSize: 22, color: palette.muted }}>
                    {meal.start}–{meal.end}
                </span>
            </div>
            <div
                style={{
                    display: 'flex',
                    fontSize: 22,
                    color: palette.muted,
                    marginTop: 4,
                    marginBottom: 20
                }}
            >
                {`${date} · ${CAMPUS_LABELS[selection.campus]}`}
            </div>
            {sections.length ? (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: GAP,
                        flex: 1,
                        overflow: 'hidden'
                    }}
                >
                    {main && highlight && (
                        <div
                            style={{
                                ...column,
                                width: highlightWidth,
                                flexShrink: 0,
                                background: palette.highlight,
                                border: `1px solid ${palette.highlightBorder}`,
                                borderRadius: 20,
                                padding: 24,
                                overflow: 'hidden'
                            }}
                        >
                            <span style={{ fontSize: 16, fontWeight: 700, color: palette.primary }}>
                                {main.name}
                            </span>
                            <div style={{ ...column, gap: 4, marginTop: 8 }}>
                                {main.items.map((item) => (
                                    <span
                                        key={item}
                                        style={{
                                            fontSize: highlight.mainSize,
                                            fontWeight: 700,
                                            lineHeight: 1.2,
                                            letterSpacing: -0.5
                                        }}
                                    >
                                        {highlight.clamp ? truncate(item, 40) : item}
                                    </span>
                                ))}
                            </div>
                            {alternatives.length > 0 && (
                                <div
                                    style={{
                                        ...column,
                                        gap: 14,
                                        marginTop: 20,
                                        paddingTop: 20,
                                        borderTop: `1px solid ${palette.highlightDivider}`
                                    }}
                                >
                                    {alternatives.map((section) => {
                                        const info = section.key
                                            ? ALTERNATIVES[section.key]
                                            : undefined;
                                        const vegetarian = section.key?.endsWith('_vegetarian');
                                        const text = section.items.join(', ');
                                        return (
                                            <div
                                                key={section.name}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 14
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        width: 36,
                                                        height: 36,
                                                        flexShrink: 0,
                                                        borderRadius: 10,
                                                        background: palette.icon
                                                    }}
                                                >
                                                    <img
                                                        width={20}
                                                        height={20}
                                                        src={icon(info?.icon ?? Leaf, 20)}
                                                        alt={
                                                            vegetarian
                                                                ? 'Opção ovolactovegetariana'
                                                                : 'Opção vegetariana estrita'
                                                        }
                                                    />
                                                </div>
                                                <div style={{ ...column, gap: 2, flex: 1 }}>
                                                    <span
                                                        style={{
                                                            fontSize: 14,
                                                            color: palette.muted
                                                        }}
                                                    >
                                                        {info?.label ?? section.name}
                                                    </span>
                                                    <span
                                                        style={{
                                                            fontSize: highlight.altSize,
                                                            fontWeight: 700,
                                                            lineHeight: 1.3
                                                        }}
                                                    >
                                                        {highlight.clamp
                                                            ? truncate(text, 60)
                                                            : text}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                    {others.length > 0 && (
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: list.columns > 1 ? 'row' : 'column',
                                flexWrap: 'wrap',
                                width: listWidth,
                                maxHeight: '100%',
                                background: palette.card,
                                borderRadius: 20,
                                overflow: 'hidden'
                            }}
                        >
                            {others.map((section, index) => (
                                <div
                                    key={section.name}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 14,
                                        width: listWidth / list.columns,
                                        padding: '11px 18px',
                                        ...(index >= list.columns && {
                                            borderTop: `1px solid ${palette.divider}`
                                        }),
                                        ...(index % list.columns > 0 && {
                                            borderLeft: `1px solid ${palette.divider}`
                                        })
                                    }}
                                >
                                    <img
                                        width={20}
                                        height={20}
                                        src={icon(
                                            (section.key && SECTION_ICONS[section.key]) ||
                                                UtensilsCrossed,
                                            20
                                        )}
                                        alt=""
                                    />
                                    <div style={{ ...column, gap: 2, flex: 1 }}>
                                        <span
                                            style={{
                                                fontSize: 13,
                                                fontWeight: 700,
                                                letterSpacing: 0.6,
                                                textTransform: 'uppercase',
                                                color: palette.muted
                                            }}
                                        >
                                            {section.name}
                                        </span>
                                        <span style={{ fontSize: list.fontSize, lineHeight: 1.3 }}>
                                            {list.texts[index]}
                                        </span>
                                    </div>
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
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        background: palette.card,
                        borderRadius: 20,
                        padding: 32
                    }}
                >
                    <span style={{ fontSize: 28, fontWeight: 700 }}>Cardápio não publicado</span>
                    <span style={{ fontSize: 22, color: palette.muted }}>
                        Ainda não há cardápio para esta refeição neste dia.
                    </span>
                </div>
            )}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    marginTop: 16,
                    fontSize: 18,
                    color: palette.primary
                }}
            >
                followw.app/ru
            </div>
        </div>
    );
}
