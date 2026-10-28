'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  LockKeyhole,
  MailCheck,
  Stethoscope,
} from 'lucide-react'
import {
  forgotPasswordAction,
  loginAction,
  registerAction,
  updatePasswordAction,
  type AuthState,
} from '@/app/auth-actions'

type AuthMode = 'login' | 'register' | 'forgot' | 'reset'

const COPY: Record<AuthMode, { eyebrow: string; title: string; description: string; heading: string }> = {
  login: {
    eyebrow: 'Bienvenido de nuevo',
    title: 'Ingresá a tu consultorio',
    description: 'Accedé a la agenda, pacientes e historias clínicas de tu espacio privado.',
    heading: 'Iniciar sesión',
  },
  register: {
    eyebrow: 'Empezá con Molar',
    title: 'Creá tu consultorio',
    description: 'Prepará un espacio independiente para organizar tu práctica dental.',
    heading: 'Crear cuenta',
  },
  forgot: {
    eyebrow: 'Recuperar acceso',
    title: 'Restablecé tu contraseña',
    description: 'Te enviaremos un enlace seguro para volver a ingresar.',
    heading: 'Recuperar contraseña',
  },
  reset: {
    eyebrow: 'Nueva contraseña',
    title: 'Elegí una nueva clave',
    description: 'Definí una contraseña segura para volver a tu consultorio.',
    heading: 'Nueva contraseña',
  },
}

const INITIAL_STATE: AuthState = {}

export function AuthShell({
  mode,
  configured,
  initialError,
  next = '/',
  validSession = true,
}: {
  mode: AuthMode
  configured: boolean
  initialError?: string
  next?: string
  validSession?: boolean
}) {
  const copy = COPY[mode]
  const [loginState, loginFormAction, loginPending] = useActionState(loginAction, INITIAL_STATE)
  const [registerState, registerFormAction, registerPending] = useActionState(
    registerAction,
    INITIAL_STATE,
  )
  const [forgotState, forgotFormAction, forgotPending] = useActionState(
    forgotPasswordAction,
    INITIAL_STATE,
  )
  const [resetState, resetFormAction, resetPending] = useActionState(
    updatePasswordAction,
    INITIAL_STATE,
  )

  const state =
    mode === 'login'
      ? loginState
      : mode === 'register'
        ? registerState
        : mode === 'forgot'
          ? forgotState
          : resetState
  const pending =
    mode === 'login'
      ? loginPending
      : mode === 'register'
        ? registerPending
        : mode === 'forgot'
          ? forgotPending
          : resetPending
  const formAction =
    mode === 'login'
      ? loginFormAction
      : mode === 'register'
        ? registerFormAction
        : mode === 'forgot'
          ? forgotFormAction
          : resetFormAction

  const showRegisterVerification = mode === 'register' && state.needsVerification

  return (
    <main className="auth-page">
      <section className="auth-brand">
        <Link href="/demo" className="auth-back">
          <ArrowLeft /> Probar el modo demo
        </Link>
        <div className="auth-brand-content">
          <div className="auth-logo">
            <div className="logo-mark">
              <span />
              <span />
            </div>
            <span>molar</span>
          </div>
          <p className="auth-kicker">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
          <div className="auth-feature">
            <Stethoscope />
            <span>Tu información clínica, aislada y organizada.</span>
          </div>
        </div>
      </section>

      <section className="auth-card-wrap">
        <div className="auth-card">
          <div className="auth-card-heading">
            <div className="auth-icon">
              <LockKeyhole />
            </div>
            <div>
              <h2>{copy.heading}</h2>
              <p>
                {mode === 'login'
                  ? 'Tu espacio privado de Molar'
                  : mode === 'register'
                    ? 'Tu consultorio en pocos pasos'
                    : mode === 'forgot'
                      ? 'Recuperá el acceso a tu cuenta'
                      : 'Actualizá tu contraseña'}
              </p>
            </div>
          </div>

          {!configured && (
            <div className="auth-config-alert">
              <AlertCircle />
              <div>
                <strong>Supabase todavía no está configurado</strong>
                <p>
                  Agregá las variables públicas de Supabase para habilitar el registro, el inicio
                  de sesión y la persistencia real de datos. No se simulan accesos ni se guardan
                  historias clínicas sin conexión.
                </p>
              </div>
            </div>
          )}

          {initialError && (
            <div className="auth-error" role="alert">
              <AlertCircle />
              <span>{initialError}</span>
            </div>
          )}

          {state.error && (
            <div className="auth-error" role="alert">
              <AlertCircle />
              <span>{state.error}</span>
            </div>
          )}

          {showRegisterVerification && (
            <div className="auth-verify">
              <MailCheck />
              <div>
                <strong>Revisá tu email</strong>
                <p>{state.success}</p>
                {state.email && <small>{state.email}</small>}
              </div>
            </div>
          )}

          {mode === 'forgot' && state.success && (
            <div className="auth-success" role="status">
              <CheckCircle2 />
              <span>{state.success}</span>
            </div>
          )}

          {mode === 'reset' && !validSession && (
            <div className="auth-error" role="alert">
              <AlertCircle />
              <span>
                El enlace de recuperación venció o no es válido. Pedí uno nuevo para continuar.
              </span>
            </div>
          )}

          {mode === 'login' && (
            <form className="auth-form" action={loginFormAction}>
              <input type="hidden" name="next" value={next} />
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  placeholder="doctor@consultorio.com"
                  autoComplete="email"
                  required
                  disabled={!configured || pending}
                />
              </label>
              <label>
                Contraseña
                <input
                  type="password"
                  name="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  disabled={!configured || pending}
                />
              </label>
              <button className="button button-primary" disabled={!configured || pending}>
                {pending ? 'Ingresando…' : 'Iniciar sesión'}
              </button>
              <Link href="/forgot-password" className="auth-link">
                ¿Olvidaste tu contraseña?
              </Link>
            </form>
          )}

          {mode === 'register' && !showRegisterVerification && (
            <form className="auth-form" action={registerFormAction}>
              <label>
                Nombre y apellido
                <input
                  name="full_name"
                  placeholder="Dra. Ana Pérez"
                  autoComplete="name"
                  minLength={3}
                  maxLength={120}
                  required
                  disabled={!configured || pending}
                />
              </label>
              <label>
                Nombre del consultorio <span className="optional">(opcional)</span>
                <input
                  name="practice_name"
                  placeholder="Consultorio Molar"
                  maxLength={80}
                  disabled={!configured || pending}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  placeholder="doctor@consultorio.com"
                  autoComplete="email"
                  required
                  disabled={!configured || pending}
                />
              </label>
              <label>
                Contraseña
                <input
                  type="password"
                  name="password"
                  placeholder="Mínimo 8 caracteres, con letras y números"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  disabled={!configured || pending}
                />
              </label>
              <label>
                Confirmar contraseña
                <input
                  type="password"
                  name="confirm_password"
                  placeholder="Repetí tu contraseña"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  disabled={!configured || pending}
                />
              </label>
              <button className="button button-primary" disabled={!configured || pending}>
                {pending ? 'Creando cuenta…' : 'Crear cuenta'}
              </button>
              <p className="auth-help">
                Si Supabase tiene habilitada la confirmación por email, vas a recibir un enlace
                antes de poder ingresar.
              </p>
            </form>
          )}

          {mode === 'forgot' && !state.success && (
            <form className="auth-form" action={forgotFormAction}>
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  placeholder="doctor@consultorio.com"
                  autoComplete="email"
                  required
                  disabled={!configured || pending}
                />
              </label>
              <button className="button button-primary" disabled={!configured || pending}>
                {pending ? 'Enviando…' : 'Enviar enlace'}
              </button>
            </form>
          )}

          {mode === 'reset' && validSession && (
            <form className="auth-form" action={resetFormAction}>
              <label>
                Nueva contraseña
                <input
                  type="password"
                  name="password"
                  placeholder="Mínimo 8 caracteres, con letras y números"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  disabled={!configured || pending}
                />
              </label>
              <label>
                Confirmar contraseña
                <input
                  type="password"
                  name="confirm_password"
                  placeholder="Repetí tu contraseña"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  disabled={!configured || pending}
                />
              </label>
              <button className="button button-primary" disabled={!configured || pending}>
                {pending ? 'Guardando…' : 'Guardar contraseña'}
              </button>
            </form>
          )}

          <div className="auth-footer">
            {mode === 'login' && (
              <>
                ¿Todavía no tenés cuenta? <Link href="/register">Crear cuenta</Link>
              </>
            )}
            {mode === 'register' && (
              <>
                ¿Ya tenés una cuenta? <Link href="/login">Iniciar sesión</Link>
              </>
            )}
            {mode === 'forgot' && (
              <>
                ¿Recordaste tu contraseña? <Link href="/login">Iniciar sesión</Link>
              </>
            )}
            {mode === 'reset' && (
              <>
                <Link href="/forgot-password">Pedir un enlace nuevo</Link> ·{' '}
                <Link href="/login">Volver al inicio de sesión</Link>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
