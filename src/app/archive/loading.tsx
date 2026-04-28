export default function Loading() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="flex items-end justify-between">
                <div className="space-y-2">
                    <div className="h-3 w-28 bg-white/[0.04] rounded" />
                    <div className="h-10 w-48 bg-white/[0.06] rounded-xl" />
                </div>
            </div>
            <div className="space-y-3">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-20 rounded-2xl bg-white/[0.02] border border-white/[0.06]" />
                ))}
            </div>
        </div>
    )
}
