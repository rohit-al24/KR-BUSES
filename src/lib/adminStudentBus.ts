import supabase from '@/lib/supabaseClient.js'
import type { UUID } from '@/lib/bus'

export async function getStudentByRoll(roll_no: string) {
  const { data, error } = await supabase.from('students').select('*').eq('roll_no', roll_no).single()
  if (error) throw error
  return data
}

export async function listBusStops() {
  const { data, error } = await supabase.from('bus_stops').select('*').order('name')
  if (error) throw error
  return data
}

export async function listRoutesWithStop(stopId: UUID) {
  // Get all routes that include this stop
  const { data, error } = await supabase
    .from('route_stops')
    .select('route_id, routes(id, name)')
    .eq('stop_id', stopId)
  if (error) throw error
  // Flatten and dedupe
  const seen = new Set()
  return (data || []).map(r => r.routes).filter(r => r && !seen.has(r.id) && seen.add(r.id))
}

export async function getCurrentBusForRoute(routeId: UUID) {
  // Get the current bus for a route (primary/substitute logic)
  const { data, error } = await supabase
    .from('bus_assignments')
    .select('*, primary:primary_bus_id(*), substitute:substitute_bus_id(*)')
    .eq('route_id', routeId)
    .single()
  if (error) throw error
  // Prefer primary if active, else substitute
  if (data.primary_active && data.primary) return data.primary
  if (!data.primary_active && data.substitute) return data.substitute
  return data.primary || data.substitute || null
}

export async function assignStudentToBus(studentId: UUID, stopId: UUID, routeId: UUID, year: number, gender: string, fees_paid: boolean, busId: UUID) {
  // Upsert student_bus_details for this student/year
  const { error } = await supabase.from('student_bus_details').upsert({
    student_id: studentId,
    year,
    boarding_point_id: stopId,
    route_id: routeId,
    bus_id: busId,
    gender,
    fees_paid,
  }, { onConflict: 'student_id,year' })
  if (error) throw error
}
