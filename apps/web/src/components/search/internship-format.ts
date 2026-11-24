export function formatCurrency(value: string | number | null | undefined): string | null {
    if (!value) return null;
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num) || num === 0) return null;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDate(isoString: string): string {
    try {
        return new Date(isoString).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    } catch {
        return isoString;
    }
}
