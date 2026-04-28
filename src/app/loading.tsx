export default function Loading() {
    return (
        <div className="min-h-[80vh] flex flex-col items-center justify-center space-y-12 py-20 animate-pulse">
            <div className="flex flex-col items-center gap-6">
                <div className="w-24 h-24 rounded-full bg-white/[0.04] border border-white/8" />
                <div className="h-16 w-96 bg-white/[0.04] rounded-2xl" />
                <div className="h-6 w-72 bg-white/[0.03] rounded-xl" />
            </div>
            <div className="flex gap-4">
                <div className="h-14 w-56 bg-white/[0.05] rounded-2xl" />
                <div className="h-14 w-48 bg-white/[0.03] rounded-2xl border border-white/8" />
            </div>
            <div className="grid grid-cols-3 gap-8 w-full max-w-4xl">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-40 rounded-3xl bg-white/[0.02] border border-white/[0.06]" />
                ))}
            </div>
        </div>
    )
}
