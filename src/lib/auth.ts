import supabase from './supabaseClient.js'

export type AppRole = 'student' | 'coordinator' | 'staff' | 'admin'

export type Profile = {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  role: AppRole
  paid: boolean
  created_at: string
  updated_at: string
}

function mapFrontendRole(role: AppRole): AppRole {
  // keep both coordinator and staff; default to student if invalid
  if (role === 'coordinator') return 'coordinator'
  if (role === 'staff') return 'staff'
  if (role === 'admin') return 'admin'
  return 'student'
}

export async function signInWithEmail(email: string, password: string) {
  if (!supabase) throw new Error('Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signUpWithEmail(email: string, password: string, fullName?: string) {
  if (!supabase) throw new Error('Supabase not configured.')
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName || '' } },
  })
  if (error) throw error
  return data
}

export async function getProfile(userId: string) {
  if (!supabase) throw new Error('Supabase not configured.')
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export async function upsertProfile(profile: Partial<Profile> & { id: string }) {
  if (!supabase) throw new Error('Supabase not configured.')
  const { data, error } = await supabase.from('profiles').upsert(profile).select().maybeSingle()
  if (error) throw error
  return data as Profile
}

export async function ensureProfile(role: AppRole) {
  if (!supabase) throw new Error('Supabase not configured.')
  const session = await supabase.auth.getSession()
  const user = session.data.session?.user
  if (!user) throw new Error('No active user session')

  let profile = await getProfile(user.id)
  const normalizedRole = mapFrontendRole(role)

  if (!profile) {
    profile = await upsertProfile({
      id: user.id,
      email: user.email ?? null,
      full_name: (user.user_metadata as any)?.full_name ?? null,
      role: normalizedRole,
      paid: false,
    } as any)
  } else if (profile.role !== normalizedRole && normalizedRole !== 'student') {
    // update role if user picked a more specific role
    await upsertProfile({ id: user.id, role: normalizedRole } as any)
    profile = (await getProfile(user.id))!
  }
  return profile
}

export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
}
