export function DayClock({ time }: { time: string }) {
    return (
        <time
            dateTime={time}
            aria-label={`Horário de Brasília: ${time}`}
            className="hidden text-2xl font-medium tabular-nums desktop:flex"
        >
            {Array.from(time, (digit, index) => (
                <span key={index} className="inline-block">
                    <span key={digit} className="clock-digit inline-block">
                        {digit}
                    </span>
                </span>
            ))}
        </time>
    );
}
