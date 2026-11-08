import { useEffect, useRef, useState, type PointerEvent } from 'react';

import { Button } from '#/components/ui/button';

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function PhotoCrop({
    file,
    onConfirm,
    onCancel
}: {
    file: File;
    onConfirm: (file: File) => void;
    onCancel: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const canvas = useRef<HTMLCanvasElement>(null);
    const [image, setImage] = useState<ImageBitmap | null>(null);
    const [crop, setCrop] = useState({ zoom: 1, x: 0.5, y: 0.5 });
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const { zoom, x, y } = crop;
    function gesture(event: PointerEvent<HTMLCanvasElement>) {
        const points = pointers.current;
        if (!points.has(event.pointerId) || !image || busy) return;
        const previous = [...points.values()];
        points.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const next = [...points.values()];
        const center = (items: typeof previous) => ({
            x: items.reduce((sum, p) => sum + p.x, 0) / items.length,
            y: items.reduce((sum, p) => sum + p.y, 0) / items.length
        });
        const before = center(previous);
        const after = center(next);
        const distance = (items: typeof previous) =>
            items.length === 2 ? Math.hypot(items[0].x - items[1].x, items[0].y - items[1].y) : 0;
        const oldDistance = distance(previous);
        const ratio = oldDistance > 0 ? distance(next) / oldDistance : 1;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (!bounds.width) return;
        setCrop((current) => {
            const scale = Math.max(800 / image.width, 1000 / image.height) * current.zoom;
            const sourcePerPixel = 800 / bounds.width / scale;
            return {
                zoom: clamp(current.zoom * ratio, 1, 4),
                x: clamp(
                    current.x -
                        ((after.x - before.x) * sourcePerPixel) /
                            Math.max(1, image.width - 800 / scale)
                ),
                y: clamp(
                    current.y -
                        ((after.y - before.y) * sourcePerPixel) /
                            Math.max(1, image.height - 1000 / scale)
                )
            };
        });
    }
    function release(event: PointerEvent<HTMLCanvasElement>) {
        pointers.current.delete(event.pointerId);
    }
    useEffect(() => {
        const target = canvas.current;
        if (!target || busy) return undefined;
        const wheel = (event: WheelEvent) => {
            event.preventDefault();
            setCrop((current) => ({
                ...current,
                zoom: Math.min(4, Math.max(1, current.zoom * Math.exp(-event.deltaY * 0.002)))
            }));
        };
        target.addEventListener('wheel', wheel, { passive: false });
        return () => target.removeEventListener('wheel', wheel);
    }, [busy]);
    const [error, setError] = useState('');
    useEffect(() => {
        let disposed = false;
        let bitmap: ImageBitmap | undefined;
        createImageBitmap(file)
            .then((value) => {
                bitmap = value;
                if (disposed) {
                    value.close();
                    return null;
                }
                if (value.width * value.height > 16_000_000) {
                    value.close();
                    setError('A imagem deve ter até 16 milhões de pixels.');
                    return null;
                }
                setImage(value);
                return null;
            })
            .catch(() => {
                if (!disposed) setError('Não foi possível abrir a imagem.');
            });
        return () => {
            disposed = true;
            bitmap?.close();
        };
    }, [file]);
    useEffect(() => {
        const context = canvas.current?.getContext('2d');
        if (!context || !image) return;
        const scale = Math.max(800 / image.width, 1000 / image.height) * zoom;
        const width = 800 / scale;
        const height = 1000 / scale;
        context.fillStyle = 'white';
        context.fillRect(0, 0, 800, 1000);
        context.drawImage(
            image,
            (image.width - width) * x,
            (image.height - height) * y,
            width,
            height,
            0,
            0,
            800,
            1000
        );
    }, [image, x, y, zoom]);
    function confirm() {
        setBusy(true);
        canvas.current?.toBlob(
            (blob) => {
                setBusy(false);
                if (blob) onConfirm(new File([blob], 'perfil.jpg', { type: 'image/jpeg' }));
                else setError('Não foi possível preparar a foto.');
            },
            'image/jpeg',
            0.9
        );
    }
    return (
        <div className="flex flex-col gap-4">
            <p id="crop-help">
                Arraste para enquadrar. Use dois dedos ou a roda do mouse para aproximar.
            </p>
            {error ? (
                <p role="alert">{error}</p>
            ) : (
                <>
                    <canvas
                        ref={canvas}
                        width={800}
                        height={1000}
                        aria-label="Ajustar enquadramento da foto"
                        aria-describedby="crop-help"
                        tabIndex={0}
                        onPointerDown={(event) => {
                            if (busy || pointers.current.size >= 2) return;
                            event.currentTarget.setPointerCapture(event.pointerId);
                            pointers.current.set(event.pointerId, {
                                x: event.clientX,
                                y: event.clientY
                            });
                        }}
                        onPointerMove={gesture}
                        onPointerUp={release}
                        onPointerCancel={release}
                        onLostPointerCapture={release}
                        onKeyDown={(event) => {
                            if (
                                busy ||
                                ![
                                    'ArrowLeft',
                                    'ArrowRight',
                                    'ArrowUp',
                                    'ArrowDown',
                                    '+',
                                    '=',
                                    '-'
                                ].includes(event.key)
                            )
                                return;
                            event.preventDefault();
                            setCrop((current) => ({
                                zoom: clamp(
                                    current.zoom +
                                        (event.key === '-'
                                            ? -0.1
                                            : ['+', '='].includes(event.key)
                                              ? 0.1
                                              : 0),
                                    1,
                                    4
                                ),
                                x: clamp(
                                    current.x +
                                        (event.key === 'ArrowLeft'
                                            ? 0.05
                                            : event.key === 'ArrowRight'
                                              ? -0.05
                                              : 0)
                                ),
                                y: clamp(
                                    current.y +
                                        (event.key === 'ArrowUp'
                                            ? 0.05
                                            : event.key === 'ArrowDown'
                                              ? -0.05
                                              : 0)
                                )
                            }));
                        }}
                        className="mx-auto aspect-4/5 w-64 max-w-full cursor-grab touch-none rounded-lg outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                    />
                </>
            )}
            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onCancel} disabled={busy}>
                    Cancelar ajuste
                </Button>
                <Button onClick={confirm} disabled={!image || !!error || busy}>
                    Confirmar foto
                </Button>
            </div>
        </div>
    );
}
