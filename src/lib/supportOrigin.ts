/** Next's internal request URL may normalize a bound address to localhost. The browser Origin must match the actual Host, including its port. */
export function isSupportSameOrigin(request: Request) {
    const url = new URL(request.url)
    const host = request.headers.get('host') || url.host
    const expected = `${url.protocol}//${host}`
    try {
        return new URL(expected).origin === expected && request.headers.get('origin') === expected
    } catch { return false }
}
