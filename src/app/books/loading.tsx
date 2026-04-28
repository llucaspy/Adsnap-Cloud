export default function Loading() {
    return (
        <div className="space-y-8 animate-pulse">
            {/* Header */}
            <div className="flex items-end justify-between">
                <div className="space-y-2">
                    <div className="h-3 w-40 bg-white/[0.04] rounded" />
                    <div className="h-10 w-80 bg-white/[0.06] rounded-xl" />
                </div>
                <div className="flex gap-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-9 w-24 rounded-xl bg-white/[0.04] border border-white/8" />
                    ))}
                </div>
            </div>
            <div className="h-px bg-white/5" />
            {/* Timeline skeleton */}
            {[1, 2].map(day => (
                <div key={day} className="space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-14 rounded-lg bg-white/[0.04]" />
                        <div className="h-6 w-32 bg-white/[0.04] rounded" />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="h-36 rounded-2xl bg-white/[0.02] border border-white/[0.06]" />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}
