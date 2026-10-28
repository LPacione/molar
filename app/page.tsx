import { redirect } from 'next/navigation'
import MolarApp from '@/components/molar-app'
import { WorkspaceError } from '@/components/workspace-error'
import { getWorkspace } from '@/lib/workspace'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const result = await getWorkspace()

  if (result.status === 'unconfigured') redirect('/login?reason=config')
  if (result.status === 'unauthenticated') redirect('/login')
  if (result.status === 'incomplete') return <WorkspaceError message={result.message} />

  return <MolarApp data={result.data} />
}
