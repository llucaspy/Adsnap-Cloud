export default function Loading() {
    return (
        <div className="space-y-8 animate-pulse">
            {/* Header */}
            <div className="flex items-end justify-between">
                <div className="space-y-2">
                    <div className="h-3 w-32 bg-white/[0.04] rounded" />
                    <div className="h-10 w-72 bg-white/[0.06] rounded-xl" />
                </div>
                <div className="flex gap-3">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-20 w-36 rounded-2xl bg-white/[0.03] border border-white/8" />
                    ))}
                </div>
            </div>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-28 rounded-2xl bg-white/[0.02] border border-white/[0.06]" />
                ))}
            </div>
            {/* Charts area */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="h-64 rounded-2xl bg-white/[0.02] border border-white/[0.06]" />
                <div className="h-64 rounded-2xl bg-white/[0.02] border border-white/[0.06]" />
            </div>
            {/* Recent captures */}
            <div className="h-48 rounded-2xl bg-white/[0.02] border border-white/[0.06]" />
        </div>
    )
}
