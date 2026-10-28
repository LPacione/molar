export default function Loading() {
  return (
    <main className="loading-page">
      <div className="flex items-center gap-2.5">
        <div className="logo-mark">
          <span />
          <span />
        </div>
        <span className="text-[20px] font-semibold tracking-[-0.04em]">molar</span>
      </div>
      <div className="loading-spinner" aria-hidden="true" />
      <p>Cargando tu consultorio…</p>
    </main>
  )
}
