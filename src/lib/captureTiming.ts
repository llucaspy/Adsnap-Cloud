export const MIN_CAPTURE_DELAY_SECONDS = 1
export const MAX_CAPTURE_DELAY_SECONDS = 10
export const DEFAULT_CAPTURE_DELAY_SECONDS = 3

export function normalizeCaptureDelaySeconds(value: unknown) {
    const numericValue = typeof value === 'number'
        ? value
        : Number.parseInt(String(value ?? DEFAULT_CAPTURE_DELAY_SECONDS), 10)

    if (!Number.isFinite(numericValue)) return DEFAULT_CAPTURE_DELAY_SECONDS

    return Math.min(
        MAX_CAPTURE_DELAY_SECONDS,
        Math.max(MIN_CAPTURE_DELAY_SECONDS, Math.round(numericValue)),
    )
}
