/** Keep only the public network/order identifiers, never arbitrary URL parameters. */
export function parseGamOrderUrl(value: string) {
    try {
        const url = new URL(value.trim())
        if (url.protocol !== 'https:' || url.hostname !== 'admanager.google.com' || url.username || url.password || (url.port && url.port !== '443')) return null
        const network = url.pathname.match(/^\/(\d{1,24})(?:\/|$)/)?.[1]
        const order = url.searchParams.get('order_id') || url.hash.match(/(?:^|[/?&#])order_id=(\d+)(?:$|[&#/])/)?.[1]
        if (!network || !order || !/^\d{1,24}$/.test(order)) return null
        return { network, orderId: order, url: `https://admanager.google.com/${network}#delivery/order/order_overview/order_id=${order}` }
    } catch { return null }
}

export function extractGamOrderUrls(text: string) {
    return [...new Set((text.match(/https?:\/\/[^\s<>]+/gi) || []).flatMap(raw => {
        const order = parseGamOrderUrl(raw.replace(/[),.;]+$/, ''))
        return order ? [order.url] : []
    }))]
}
