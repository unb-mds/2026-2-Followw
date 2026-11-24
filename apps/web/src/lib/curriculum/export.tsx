import type {
    AcademicState,
    CurriculumModel,
    FlowSubject
} from '@followw/core/lib/curriculum/types.ts';

import { creditText, hoursText } from '@followw/core/lib/curriculum/format.ts';
import { layoutCurriculum } from '@followw/core/lib/curriculum/geometry.ts';
import { stateLabels } from '@followw/core/lib/curriculum/model.ts';
import { titleCase } from '@followw/core/lib/profile.ts';
import { renderToStaticMarkup } from 'react-dom/server';

import { Connections } from '#/components/curriculum/Connections';

const HEADER_HEIGHT = 74;
const MAX_PNG_DIMENSION = 12288;
const MAX_PNG_PIXELS = 16_000_000;
const FONT = 'system-ui, sans-serif';
const stateColors: Record<AcademicState, string> = {
    completed: '--success',
    enrolled: '--info',
    overdue: '--destructive',
    pending: '--muted',
    unknown: '--background'
};

export async function createCurriculumPng({
    model,
    name,
    matrix,
    state
}: {
    model: CurriculumModel;
    name: string;
    matrix: string;
    state?: (subject: FlowSubject) => AcademicState;
}): Promise<Blob> {
    const geometry = layoutCurriculum(model, 0);
    const theme = getComputedStyle(document.documentElement);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar o fluxograma.');
    context.font = `700 22px ${FONT}`;
    const titleWidth = context.measureText(name).width + 48;
    context.font = `700 12px ${FONT}`;
    const colors = new Map<string, string>();
    const colorOf = (token: string) => {
        const cached = colors.get(token);
        if (cached) return cached;
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = theme.getPropertyValue(token).trim();
        context.fillRect(0, 0, 1, 1);
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
        const color = `rgb(${r}, ${g}, ${b})`;
        colors.set(token, color);
        return color;
    };
    const background = colorOf('--background');
    const foreground = colorOf('--foreground');
    const muted = colorOf('--muted-foreground');
    const width = Math.ceil(Math.max(520, titleWidth, geometry.width));
    const height = geometry.height + HEADER_HEIGHT;
    const scale = Math.min(
        5,
        MAX_PNG_DIMENSION / Math.max(width, height),
        Math.sqrt(MAX_PNG_PIXELS / (width * height))
    );
    const pixelWidth = Math.max(1, Math.round(width * scale));
    const pixelHeight = Math.max(1, Math.round(height * scale));
    const svg = renderToStaticMarkup(
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={pixelWidth}
            height={pixelHeight}
            viewBox={`0 0 ${width} ${height}`}
            fontFamily={FONT}
        >
            <title>{`Fluxograma de ${name}`}</title>
            <rect width={width} height={height} fill={background} />
            <text x={24} y={34} fill={foreground} fontSize={22} fontWeight={700}>
                {name}
            </text>
            <text x={24} y={55} fill={muted} fontSize={13}>
                {matrix}
            </text>
            <g transform={`translate(${(width - geometry.width) / 2} ${HEADER_HEIGHT})`}>
                <Connections
                    model={model}
                    geometry={geometry}
                    visibleEdges={null}
                    colorOf={colorOf}
                />
                {geometry.columns.map(({ period, x }) => (
                    <text
                        key={period}
                        x={x}
                        y={23}
                        textAnchor="middle"
                        fill={foreground}
                        fontSize={14}
                        fontWeight={700}
                    >
                        {period}º semestre
                    </text>
                ))}
                {geometry.nodes.map(({ subject, x, y, width: cardWidth, height: cardHeight }) => {
                    const status = state?.(subject);
                    const accent = colorOf(stateColors[status ?? 'pending']);
                    const tinted =
                        status === 'completed' || status === 'enrolled' || status === 'overdue';
                    const subjectName = titleCase(subject.name);
                    const lines = wrapName(
                        subjectName,
                        (text) => context.measureText(text).width <= cardWidth - 24
                    );
                    return (
                        <g key={subject.code} transform={`translate(${x} ${y})`}>
                            <title>{`${subject.code} · ${subjectName}${status ? ` · ${stateLabels[status]}` : ''}`}</title>
                            <rect
                                width={cardWidth}
                                height={cardHeight}
                                rx={8}
                                fill={accent}
                                fillOpacity={tinted ? 0.1 : 1}
                                stroke={tinted ? accent : colorOf('--border')}
                                strokeDasharray={status === 'unknown' ? '4 3' : undefined}
                            />
                            <text x={12} y={20} fill={muted} fontSize={12}>
                                {subject.code}
                            </text>
                            <text x={12} y={40} fill={foreground} fontSize={12} fontWeight={700}>
                                {lines.map(({ text, offset }) => (
                                    <tspan key={offset} x={12} dy={offset ? 14 : 0}>
                                        {text}
                                    </tspan>
                                ))}
                            </text>
                            <text
                                x={cardWidth - 12}
                                y={cardHeight - 12}
                                textAnchor="end"
                                fill={muted}
                                fontSize={11}
                            >
                                {hoursText(subject.hours)} · {creditText(subject.hours, 'short')}
                            </text>
                        </g>
                    );
                })}
            </g>
        </svg>
    );
    const imageUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
        const image = document.createElement('img');
        image.src = imageUrl;
        await image.decode();
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        context.drawImage(image, 0, 0, pixelWidth, pixelHeight);
    } finally {
        URL.revokeObjectURL(imageUrl);
    }

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Não foi possível gerar o PNG do fluxograma.'));
        }, 'image/png');
    });
}

function wrapName(name: string, fits: (text: string) => boolean) {
    const lines: { text: string; offset: number }[] = [];
    let rest = name;
    while (rest && lines.length < 4) {
        if (fits(rest)) {
            lines.push({ text: rest, offset: name.length - rest.length });
            break;
        }
        const last = lines.length === 3;
        let length = rest.length;
        while (length > 1 && !fits(`${rest.slice(0, length)}${last ? '…' : ''}`)) length--;
        const space = rest.lastIndexOf(' ', length);
        const end = space > 0 ? space : length;
        lines.push({
            text: `${rest.slice(0, end)}${last ? '…' : ''}`,
            offset: name.length - rest.length
        });
        rest = rest.slice(end).trimStart();
    }
    return lines;
}
