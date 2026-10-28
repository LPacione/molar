'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getSiteUrl,
  isSupabaseConfigured,
  safeRedirectPath,
  SUPABASE_CONFIG_MESSAGE,
} from '@/lib/supabase/config'

export type AuthState = {
  error?: string
  success?: string
  needsVerification?: boolean
  email?: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function text(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : ''
}

function validateEmail(email: string) {
  return EMAIL_PATTERN.test(email)
}

function validatePassword(password: string) {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.'
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'La contraseña debe incluir letras y números.'
  }
  return null
}

async function requestOrigin() {
  const headerStore = await headers()
  const origin = headerStore.get('origin')
  return getSiteUrl(origin ?? undefined)
}

export async function loginAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return { error: SUPABASE_CONFIG_MESSAGE }

  const email = text(formData.get('email')).toLowerCase()
  const password = String(formData.get('password') ?? '')
  const next = safeRedirectPath(text(formData.get('next')) || null)

  if (!validateEmail(email)) return { error: 'Ingresá un email válido.' }
  if (!password) return { error: 'Ingresá tu contraseña.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    if (error.message.toLowerCase().includes('email not confirmed')) {
      return {
        error:
          'Tu email todavía no está confirmado. Revisá el enlace de verificación o pedí uno nuevo desde el registro.',
      }
    }
    if (error.status === 429) {
      return { error: 'Demasiados intentos. Esperá unos minutos y volvé a intentar.' }
    }
    return { error: 'Email o contraseña incorrectos.' }
  }

  redirect(next)
}

export async function registerAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return { error: SUPABASE_CONFIG_MESSAGE }

  const fullName = text(formData.get('full_name'))
  const practiceName = text(formData.get('practice_name'))
  const email = text(formData.get('email')).toLowerCase()
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirm_password') ?? '')

  if (fullName.length < 3) return { error: 'Ingresá tu nombre y apellido.' }
  if (practiceName.length > 80) {
    return { error: 'El nombre del consultorio no puede superar los 80 caracteres.' }
  }
  if (!validateEmail(email)) return { error: 'Ingresá un email válido.' }

  const passwordError = validatePassword(password)
  if (passwordError) return { error: passwordError }
  if (password !== confirmPassword) return { error: 'Las contraseñas no coinciden.' }

  const origin = await requestOrigin()
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        practice_name: practiceName || null,
      },
      emailRedirectTo: `${origin}/auth/callback?next=/`,
    },
  })

  if (error) {
    console.error('Error de registro:', error.message)
    if (error.status === 429) {
      return { error: 'Demasiados intentos. Esperá unos minutos y volvé a intentar.' }
    }

    const message = error.message.toLowerCase()
    if (message.includes('already') && message.includes('registered')) {
      // No confirmamos si el email existe: misma respuesta que un alta nueva.
      return {
        needsVerification: true,
        email,
        success:
          'Si la cuenta puede crearse, vas a recibir un email de verificación. Si ya tenés una cuenta, iniciá sesión o recuperá tu contraseña.',
      }
    }

    return {
      error:
        'No pudimos completar el registro con esos datos. Revisá la información e intentá nuevamente.',
    }
  }

  if (data.session) {
    redirect('/')
  }

  return {
    needsVerification: true,
    email,
    success:
      'Te enviamos un email de verificación. Abrí el enlace para activar tu consultorio y después iniciá sesión.',
  }
}

export async function forgotPasswordAction(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isSupabaseConfigured()) return { error: SUPABASE_CONFIG_MESSAGE }

  const email = text(formData.get('email')).toLowerCase()
  if (!validateEmail(email)) return { error: 'Ingresá un email válido.' }

  const origin = await requestOrigin()
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  })

  if (error) {
    console.error('Error al solicitar recuperación:', error.message)
    if (error.status === 429) {
      return { error: 'Demasiados intentos. Esperá unos minutos y volvé a intentar.' }
    }
  }

  // No confirmamos ni negamos si el email existe.
  return {
    success:
      'Si existe una cuenta con ese email, vas a recibir un enlace para restablecer la contraseña.',
  }
}

export async function updatePasswordAction(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isSupabaseConfigured()) return { error: SUPABASE_CONFIG_MESSAGE }

  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirm_password') ?? '')

  const passwordError = validatePassword(password)
  if (passwordError) return { error: passwordError }
  if (password !== confirmPassword) return { error: 'Las contraseñas no coinciden.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      error: 'El enlace de recuperación venció o no es válido. Pedí uno nuevo desde "Olvidé mi contraseña".',
    }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    console.error('Error al actualizar contraseña:', error.message)
    return { error: 'No pudimos actualizar la contraseña. Pedí un enlace nuevo e intentá otra vez.' }
  }

  redirect('/')
}

export async function signOutAction() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    const { error } = await supabase.auth.signOut()
    if (error) console.error('Error al cerrar sesión:', error.message)
  }
  revalidatePath('/', 'layout')
  redirect('/login')
}
