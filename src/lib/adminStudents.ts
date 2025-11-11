import supabase from '@/lib/supabaseClient.js'
import type { UUID } from '@/lib/bus'
import type { Student } from '@/lib/students'

export async function listStudents(): Promise<Student[]> {
  const { data, error } = await supabase.from('students').select('*').order('roll_no')
  if (error) throw error
  return data as Student[]
}

export async function updateStudentRoute(studentId: UUID, routeId: UUID | null, stopId: UUID | null): Promise<void> {
  const { error } = await supabase.from('students').update({ route_id: routeId, stop_id: stopId }).eq('id', studentId)
  if (error) throw error
}
