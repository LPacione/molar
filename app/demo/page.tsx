import Link from 'next/link'
import DemoApp from '@/components/demo-app'

export const metadata = { title: 'Modo demo | Molar' }

export default function DemoPage() {
  return (
    <>
      <div className="demo-banner">
        <span>
          <strong>Modo demo</strong> · Datos ficticios de demostración, sin conexión a Supabase. No
          uses información clínica real acá.
        </span>
        <Link href="/login">Ingresar al modo autenticado</Link>
      </div>
      <DemoApp />
    </>
  )
}
