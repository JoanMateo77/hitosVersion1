/**
 * Sesión falsa de Supabase Auth. El JWT NO está firmado con ninguna clave real:
 * solo tiene la forma header.payload.firma que supabase-js espera leer.
 */
import { USER } from './data'

export const MOCK_SUPABASE_URL = 'http://mock.supabase.test'
/** supabase-js: `sb-${hostname.split('.')[0]}-auth-token`. */
export const SESSION_STORAGE_KEY = 'sb-mock-auth-token'

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

export function mockUser() {
  const created = new Date(Date.now() - 60 * 86_400_000).toISOString()
  return {
    id: USER.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: USER.email,
    email_confirmed_at: created,
    phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: USER.name, name: USER.name },
    identities: [],
    created_at: created,
    updated_at: created,
  }
}

export function mockSession() {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + 10 * 365 * 86_400
  const access_token = [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({
      sub: USER.id,
      email: USER.email,
      role: 'authenticated',
      aud: 'authenticated',
      iat: now,
      exp,
      session_id: '00000000-0000-4000-8000-0000000000ss',
    }),
    'mock-signature',
  ].join('.')
  return {
    access_token,
    refresh_token: 'mock-refresh-token',
    token_type: 'bearer',
    expires_in: exp - now,
    expires_at: exp,
    user: mockUser(),
  }
}
