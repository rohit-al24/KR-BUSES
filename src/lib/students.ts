import supabase from '@/lib/supabaseClient.js'

export type Student = {
  id: string
  roll_no: string
  email?: string | null
  full_name: string
  class?: string | null
  section?: string | null
  gender?: 'male' | 'female' | null
  route_id?: string | null
  stop_id?: string | null
}

export type RouteOverview = {
  route_id: string
  route_name: string
  stops: Array<{ id: string; name: string; position: number }>
  assignment: any | null
  primary_bus: any | null
  substitute_bus: any | null
  current_bus: any | null
}

export async function studentLogin(identifier: string, password: string): Promise<Student | null> {
  const { data, error } = await supabase.rpc('student_login', { identifier, pass: password })
  if (error) throw error
  const row = (data && Array.isArray(data) ? data[0] : data) as any
  if (!row) return null
  return row as Student
}

export async function getRouteOverview(route_id: string): Promise<RouteOverview | null> {
  const { data, error } = await supabase.rpc('get_route_overview', { p_route_id: route_id })
  if (error) throw error
  const row = (data && Array.isArray(data) ? data[0] : data) as any
  return (row || null) as RouteOverview | null
}

const STUDENT_SESSION_KEY = 'studentSession'

export function saveStudentSession(student: Student) {
  try { localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(student)) } catch {}
}

export function loadStudentSession(): Student | null {
  try {
    const raw = localStorage.getItem(STUDENT_SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearStudentSession() {
  try { localStorage.removeItem(STUDENT_SESSION_KEY) } catch {}
}
