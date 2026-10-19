import Link from 'next/link'

export function QuarantineView() {
    return <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">Quarentena e falhas de captura</h2>
        <p className="text-sm leading-6 text-white/60">Analise o motivo, as tentativas e os eventos de cada captura na página de diagnóstico.</p>
        <Link href="/quarantine" className="inline-block rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black">Abrir quarentena →</Link>
    </section>
}
