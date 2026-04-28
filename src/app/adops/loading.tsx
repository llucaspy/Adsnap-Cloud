export default function Loading() {
    return (
        <div className="space-y-8 animate-pulse">
            {/* Header */}
            <div className="flex items-end justify-between">
                <div className="space-y-2">
                    <div className="h-3 w-36 bg-white/[0.04] rounded" />
                    <div className="h-10 w-72 bg-white/[0.06] rounded-xl" />
                </div>
            </div>
            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-24 rounded-2xl bg-white/[0.02] border border-white/[0.06]" />
                ))}
            </div>
            {/* Table */}
            <div className="rounded-2xl border border-white/[0.06] overflow-hidden">
                <div className="h-12 bg-white/[0.03]" />
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-16 border-t border-white/[0.04]" />
                ))}
            </div>
        </div>
    )
}
