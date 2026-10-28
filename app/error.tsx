'use client'

import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="workspace-error-page">
      <div className="workspace-error-card">
        <div className="workspace-error-icon">
          <AlertCircle />
        </div>
        <h1>Algo no salió como esperábamos</h1>
        <p>
          No mostramos información de tu consultorio para evitar exponer datos por error. Podés
          reintentar la operación.
        </p>
        <div className="workspace-error-actions">
          <button className="button button-primary" onClick={reset}>
            Reintentar
          </button>
          <Link href="/login" className="button button-secondary">
            Ir a iniciar sesión
          </Link>
        </div>
      </div>
    </main>
  )
}
