import type { GridSemester, PlannedClass } from '#/lib/planned-schedule';

import { GRID_DAYS } from '#/lib/planned-schedule';
import { describeSchedule } from '#/lib/schedule';

const WIDTH = 1200;
const PADDING = 40;
const CONTENT = WIDTH - PADDING * 2;
const TITLE_HEIGHT = 64;
const ROW_HEIGHT = 64;
const DAYS = ['Horários', ...GRID_DAYS.map(({ label }) => label)];
const COLUMN_WIDTH = CONTENT / DAYS.length;
const CARD_GAP = 12;
const SECTION_GAP = 40;
const FOOTER_HEIGHT = 64;

const details = (item: PlannedClass) =>
    [item.room, item.professors.map(({ name }) => name).join(', ')].filter(Boolean).join(' · ');
const cardHeight = (item: PlannedClass) => (details(item) ? 100 : 76);

export async function createSchedulePng(sections: GridSemester[]): Promise<Blob> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível gerar a imagem da grade.');
    const root = document.documentElement;
    const theme = getComputedStyle(root);
    const color = (token: string) => theme.getPropertyValue(token).trim();
    const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
    const font = (size: number, weight = 400) => (ctx.font = `${weight} ${size}px ${family}`);
    // Cabeçalho da tabela igual ao do modal: invertido no tema claro.
    const dark = root.dataset.theme === 'dark';
    const header = {
        fill: dark ? '--background' : '--foreground',
        text: dark ? '--foreground' : '--background'
    };
    const fit = (text: string, max: number) => {
        if (ctx.measureText(text).width <= max) return text;
        let cut = text;
        while (cut && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
        return `${cut.trimEnd()}…`;
    };
    const roundRect = (x: number, y: number, width: number, height: number, radius: number) => {
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, radius);
    };

    const height =
        PADDING +
        sections.reduce(
            (sum, { classes, rows }) =>
                sum +
                TITLE_HEIGHT +
                (rows.length ? (rows.length + 1) * ROW_HEIGHT + 24 : 0) +
                classes.reduce((total, item) => total + cardHeight(item) + CARD_GAP, 0) -
                CARD_GAP +
                SECTION_GAP,
            0
        ) -
        SECTION_GAP +
        FOOTER_HEIGHT;
    canvas.width = WIDTH * 2;
    canvas.height = height * 2;
    ctx.scale(2, 2);
    ctx.fillStyle = color('--background');
    ctx.fillRect(0, 0, WIDTH, height);
    ctx.textBaseline = 'middle';

    let y = PADDING;
    for (const { semester, classes, rows } of sections) {
        ctx.textAlign = 'left';
        ctx.fillStyle = color('--foreground');
        font(30, 700);
        ctx.fillText(`Minha grade · ${semester}`, PADDING, y + 20);
        y += TITLE_HEIGHT;

        if (rows.length) {
            const tableHeight = (rows.length + 1) * ROW_HEIGHT;
            ctx.save();
            roundRect(PADDING, y, CONTENT, tableHeight, 12);
            ctx.clip();
            ctx.fillStyle = color(header.fill);
            ctx.fillRect(PADDING, y, CONTENT, ROW_HEIGHT);
            ctx.fillStyle = color(header.text);
            ctx.textAlign = 'center';
            font(18, 700);
            DAYS.forEach((day, column) =>
                ctx.fillText(day, PADDING + COLUMN_WIDTH * (column + 0.5), y + ROW_HEIGHT / 2)
            );
            let rowY = y + ROW_HEIGHT;
            for (const { start, end, cells } of rows) {
                for (let column = 0; column < DAYS.length; column++) {
                    const x = PADDING + column * COLUMN_WIDTH;
                    const center = x + COLUMN_WIDTH / 2;
                    ctx.fillStyle = color(column === 0 ? '--muted' : '--card');
                    ctx.fillRect(x, rowY, COLUMN_WIDTH, ROW_HEIGHT);
                    ctx.strokeStyle = color('--border');
                    ctx.strokeRect(x, rowY, COLUMN_WIDTH, ROW_HEIGHT);
                    if (column === 0) {
                        ctx.fillStyle = color('--foreground');
                        font(16, 500);
                        ctx.fillText(`${start}–${end}`, center, rowY + ROW_HEIGHT / 2);
                        continue;
                    }
                    const entry = cells[column - 1];
                    if (!entry) {
                        ctx.fillStyle = color('--muted-foreground');
                        font(16);
                        ctx.fillText('—', center, rowY + ROW_HEIGHT / 2);
                        continue;
                    }
                    ctx.fillStyle = color('--primary');
                    ctx.globalAlpha = 0.05;
                    ctx.fillRect(x, rowY, COLUMN_WIDTH, ROW_HEIGHT);
                    ctx.globalAlpha = 1;
                    font(16, 700);
                    ctx.fillText(entry.code, center, rowY + 22);
                    font(16);
                    ctx.fillText(`T${entry.number}`, center, rowY + 42);
                }
                rowY += ROW_HEIGHT;
            }
            ctx.restore();
            roundRect(PADDING, y, CONTENT, tableHeight, 12);
            ctx.strokeStyle = color('--border');
            ctx.stroke();
            y += tableHeight + 24;
        }

        for (const item of classes) {
            const cardY = y;
            const inner = CONTENT - 48;
            roundRect(PADDING, cardY, CONTENT, cardHeight(item), 16);
            ctx.fillStyle = color('--card');
            ctx.fill();
            ctx.strokeStyle = color('--border');
            ctx.stroke();
            const code = `${item.code} · T${item.number}`;
            font(16, 500);
            ctx.textAlign = 'right';
            ctx.fillStyle = color('--muted-foreground');
            ctx.fillText(code, WIDTH - PADDING - 24, cardY + 26);
            const codeWidth = ctx.measureText(code).width + 16;
            ctx.textAlign = 'left';
            ctx.fillStyle = color('--primary');
            font(16, 600);
            ctx.fillText(
                fit(describeSchedule(item.schedule) || 'Horário a definir', inner - codeWidth),
                PADDING + 24,
                cardY + 26
            );
            ctx.fillStyle = color('--foreground');
            font(20, 600);
            ctx.fillText(fit(item.name, inner), PADDING + 24, cardY + 52);
            if (details(item)) {
                ctx.fillStyle = color('--muted-foreground');
                font(16);
                ctx.fillText(fit(details(item), inner), PADDING + 24, cardY + 78);
            }
            y += cardHeight(item) + CARD_GAP;
        }
        y += SECTION_GAP - CARD_GAP;
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = color('--muted-foreground');
    font(16, 500);
    ctx.fillText('followw.app', WIDTH / 2, height - FOOTER_HEIGHT / 2);
    return new Promise((resolve, reject) =>
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível gerar o PNG.'))),
            'image/png'
        )
    );
}
