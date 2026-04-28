export default function Loading() {
    return (
        <div className="max-w-3xl mx-auto space-y-12 py-8 animate-pulse">
            <div className="text-center space-y-6">
                <div className="h-8 w-40 mx-auto bg-white/[0.05] rounded-full" />
                <div className="h-14 w-96 mx-auto bg-white/[0.06] rounded-xl" />
                <div className="h-5 w-72 mx-auto bg-white/[0.03] rounded-lg" />
            </div>
            <div className="space-y-6">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-16 rounded-2xl bg-white/[0.02] border border-white/[0.06]" />
                ))}
            </div>
        </div>
    )
}
