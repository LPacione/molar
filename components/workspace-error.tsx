import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { signOutAction } from '@/app/auth-actions'

export function WorkspaceError({ message }: { message: string }) {
  return (
    <main className="workspace-error-page">
      <div className="workspace-error-card">
        <div className="auth-logo">
          <div className="logo-mark">
            <span />
            <span />
          </div>
          <span>molar</span>
        </div>
        <div className="workspace-error-icon">
          <AlertCircle />
        </div>
        <h1>No pudimos abrir tu consultorio</h1>
        <p>{message}</p>
        <p className="workspace-error-help">
          Por seguridad no mostramos información de ninguna otra cuenta. Podés cerrar sesión y
          volver a intentar.
        </p>
        <div className="workspace-error-actions">
          <form action={signOutAction}>
            <button className="button button-primary" type="submit">
              Cerrar sesión
            </button>
          </form>
          <Link href="/demo" className="button button-secondary">
            Ver modo demo
          </Link>
        </div>
      </div>
    </main>
  )
}
