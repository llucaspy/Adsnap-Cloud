import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { AssemblyView } from '@/components/AssemblyView'

export default async function AssemblyPage() {
    const session = await getSession()

    if (!session || session.role !== 'admin') {
        redirect('/login')
    }

    return (
        <div className="space-y-8 animate-fade-in py-10">
            <AssemblyView />
        </div>
    )
}
