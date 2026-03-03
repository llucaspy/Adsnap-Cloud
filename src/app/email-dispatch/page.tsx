import { getEmailDispatches, getCampaignsForDispatch } from '@/app/actions'
import { EmailDispatchView } from '@/components/EmailDispatchView'

export const dynamic = 'force-dynamic'

export default async function EmailDispatchPage() {
    const [dispatches, campaigns] = await Promise.all([
        getEmailDispatches(),
        getCampaignsForDispatch(),
    ])

    return (
        <EmailDispatchView
            initialDispatches={dispatches}
            campaigns={campaigns}
        />
    )
}
