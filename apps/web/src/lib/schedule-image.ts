import { parseSchedule, SCHEDULE_SLOTS } from '#/lib/schedule';

interface ImageClass {
    code: string;
    name: string;
    classroom: { semester: string; number: string; schedule?: string | null };
}

const WIDTH = 1200;
const PADDING = 32;
const ROW_HEIGHT = 64;
const DAYS = ['Horários', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const COLUMN_WIDTH = (WIDTH - PADDING * 2) / DAYS.length;

export async function createSchedulePng(items: ImageClass[]): Promise<Blob> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível gerar a imagem da grade.');
    const theme = getComputedStyle(document.documentElement);
    const color = (token: string) => theme.getPropertyValue(token).trim();
    const sections = [...new Set(items.map((item) => item.classroom.semester))].map((semester) => {
        const entries = items
            .filter((item) => item.classroom.semester === semester)
            .map((item) => ({
                code: item.code,
                classroom: item.classroom,
                times: parseSchedule(item.classroom.schedule)
            }));
        const times = entries.flatMap((entry) => entry.times);
        const first = times.map((time) => time.start).toSorted()[0];
        const last = times
            .map((time) => time.end)
            .toSorted()
            .at(-1);
        const rows = SCHEDULE_SLOTS.filter(
            ([start, end]) => first && last && start >= first && end <= last
        );
        return { semester, entries, rows };
    });
    ctx.font = '18px sans-serif';
    const wrap = (text: string) => {
        const lines: string[] = [];
        let line = '';
        for (const word of text.split(' ')) {
            const next = line ? `${line} ${word}` : word;
            if (line && ctx.measureText(next).width > WIDTH - PADDING * 2) {
                lines.push(line);
                line = word;
            } else line = next;
        }
        if (line) lines.push(line);
        return lines;
    };
    const legends = items.map((item) =>
        wrap(
            `${item.code} · ${item.name} · Turma ${item.classroom.number} · ${item.classroom.semester}${parseSchedule(item.classroom.schedule).length ? '' : ' · Horário a definir'}`
        )
    );
    const height =
        100 +
        sections.reduce(
            (sum, section) =>
                sum + 64 + (section.rows.length ? section.rows.length + 1 : 0) * ROW_HEIGHT,
            0
        ) +
        legends.reduce((sum, lines) => sum + lines.length * 28 + 8, 0) +
        PADDING;
    canvas.width = WIDTH * 2;
    canvas.height = height * 2;
    ctx.scale(2, 2);
    ctx.fillStyle = color('--card');
    ctx.fillRect(0, 0, WIDTH, height);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color('--foreground');
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('Minha grade semanal · Followw', PADDING, 48);
    let y = 100;
    for (const { semester, entries, rows } of sections) {
        ctx.textAlign = 'left';
        ctx.fillStyle = color('--foreground');
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(`Semestre ${semester}`, PADDING, y + 20);
        y += 48;
        if (!rows.length) {
            y += 16;
            continue;
        }
        ctx.fillStyle = color('--primary');
        ctx.fillRect(PADDING, y, WIDTH - PADDING * 2, ROW_HEIGHT);
        ctx.fillStyle = color('--primary-foreground');
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        DAYS.forEach((day, column) =>
            ctx.fillText(day, PADDING + COLUMN_WIDTH * (column + 0.5), y + ROW_HEIGHT / 2)
        );
        y += ROW_HEIGHT;
        for (const [start, end] of rows) {
            for (let column = 0; column < DAYS.length; column++) {
                const x = PADDING + column * COLUMN_WIDTH;
                ctx.fillStyle = color(column === 0 ? '--muted' : '--card');
                ctx.fillRect(x, y, COLUMN_WIDTH, ROW_HEIGHT);
                ctx.strokeStyle = color('--border');
                ctx.strokeRect(x, y, COLUMN_WIDTH, ROW_HEIGHT);
                ctx.font = '18px sans-serif';
                if (column === 0) {
                    ctx.fillStyle = color('--foreground');
                    ctx.fillText(`${start}–${end}`, x + COLUMN_WIDTH / 2, y + ROW_HEIGHT / 2);
                    continue;
                }
                const entry = entries.find((item) =>
                    item.times.some(
                        (time) => time.weekday === column && time.start < end && time.end > start
                    )
                );
                ctx.fillStyle = color(entry ? '--primary' : '--muted-foreground');
                if (entry) {
                    ctx.fillText(entry.code, x + COLUMN_WIDTH / 2, y + 22);
                    ctx.fillText(`T${entry.classroom.number}`, x + COLUMN_WIDTH / 2, y + 44);
                } else ctx.fillText('—', x + COLUMN_WIDTH / 2, y + ROW_HEIGHT / 2);
            }
            y += ROW_HEIGHT;
        }
        y += 16;
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = color('--foreground');
    ctx.font = '18px sans-serif';
    for (const lines of legends) {
        for (const line of lines) {
            ctx.fillText(line, PADDING, y + 14);
            y += 28;
        }
        y += 8;
    }
    return new Promise((resolve, reject) =>
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível gerar o PNG.'))),
            'image/png'
        )
    );
}
