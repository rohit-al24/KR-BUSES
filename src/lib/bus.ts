import supabase from '@/lib/supabaseClient.js'

export type UUID = string

export type BusStop = {
  id: UUID
  name: string
  created_at?: string
}

export type Bus = {
  id: UUID
  bus_number: string
  capacity?: number | null
  active: boolean
  created_at?: string
}

export type Route = {
  id: UUID
  name: string
  created_at?: string
}

export type RouteStop = {
  route_id: UUID
  stop_id: UUID
  position: number
}

export type BusAssignment = {
  route_id: UUID
  primary_bus_id: UUID | null
  substitute_bus_id: UUID | null
  primary_active: boolean
  updated_at?: string
}

function assertClient() {
  if (!supabase) throw new Error('Supabase client not initialized')
}

// Bus stops
export async function listStops(): Promise<BusStop[]> {
  assertClient()
  const { data, error } = await supabase.from('bus_stops').select('*').order('name')
  if (error) throw error
  return data as BusStop[]
}

export async function createStop(name: string): Promise<BusStop> {
  assertClient()
  const { data, error } = await supabase.from('bus_stops').insert({ name }).select('*').single()
  if (error) throw error
  return data as BusStop
}

export async function deleteStop(id: UUID): Promise<void> {
  assertClient()
  const { error } = await supabase.from('bus_stops').delete().eq('id', id)
  if (error) throw error
}

// Buses
export async function listBuses(): Promise<Bus[]> {
  assertClient()
  const { data, error } = await supabase.from('buses').select('*').order('bus_number')
  if (error) throw error
  return data as Bus[]
}

export async function createBus(bus_number: string, capacity?: number): Promise<Bus> {
  assertClient()
  const { data, error } = await supabase
    .from('buses')
    .insert({ bus_number, capacity: capacity ?? null, active: true })
    .select('*')
    .single()
  if (error) throw error
  return data as Bus
}

export async function setBusActive(id: UUID, active: boolean): Promise<void> {
  assertClient()
  const { error } = await supabase.from('buses').update({ active }).eq('id', id)
  if (error) throw error
}

export async function deleteBus(id: UUID): Promise<void> {
  assertClient()
  const { error } = await supabase.from('buses').delete().eq('id', id)
  if (error) throw error
}

export async function updateBus(id: UUID, data: Partial<Pick<Bus,'bus_number'|'capacity'|'active'>>): Promise<Bus> {
  assertClient()
  const { data: row, error } = await supabase.from('buses').update(data).eq('id', id).select('*').single()
  if (error) throw error
  return row as Bus
}

// Routes
export async function createRoute(name: string, stopIdsInOrder: UUID[]): Promise<Route> {
  assertClient()
  const { data: route, error: routeErr } = await supabase.from('routes').insert({ name }).select('*').single()
  if (routeErr) throw routeErr
  const rows = stopIdsInOrder.map((stop_id, idx) => ({ route_id: route.id, stop_id, position: idx + 1 }))
  const { error: rsErr } = await supabase.from('route_stops').insert(rows)
  if (rsErr) throw rsErr
  return route as Route
}

export type RouteWithStops = Route & { stops: (BusStop & { position: number })[] }

export async function listRoutesWithStops(): Promise<RouteWithStops[]> {
  assertClient()
  // fetch routes
  const { data: routes, error: routesErr } = await supabase.from('routes').select('*').order('name')
  if (routesErr) throw routesErr
  if (!routes?.length) return []
  const routeIds = routes.map((r: any) => r.id)
  const { data: rs, error: rsErr } = await supabase
    .from('route_stops')
    .select('route_id, position, bus_stops:stop_id(id, name)')
    .in('route_id', routeIds)
    .order('position')
  if (rsErr) throw rsErr
  const grouped = {} as { [key: string]: RouteWithStops }
  routes.forEach((r: any) => { grouped[r.id] = { ...(r as Route), stops: [] } })
  rs?.forEach((row: any) => {
    const route = grouped[row.route_id]
    if (route) route.stops.push({ id: row.bus_stops.id, name: row.bus_stops.name, position: row.position })
  })
  return Object.values(grouped)
}

// Assignments
export async function upsertAssignment(params: { route_id: UUID; primary_bus_id: UUID | null; substitute_bus_id?: UUID | null; primary_active?: boolean }): Promise<BusAssignment> {
  assertClient()
  const payload = {
    route_id: params.route_id,
    primary_bus_id: params.primary_bus_id,
    substitute_bus_id: params.substitute_bus_id ?? null,
    primary_active: params.primary_active ?? true,
  }
  const { data, error } = await supabase
    .from('bus_assignments')
    .upsert(payload, { onConflict: 'route_id' })
    .select('*')
    .single()
  if (error) throw error
  return data as BusAssignment
}

export type RouteWithAssignment = RouteWithStops & {
  assignment?: BusAssignment | null
  primary_bus?: Bus | null
  substitute_bus?: Bus | null
  current_bus?: Bus | null
}

export async function listRoutesWithAssignment(): Promise<RouteWithAssignment[]> {
  assertClient()
  const routes = await listRoutesWithStops()
  if (!routes.length) return []
  const routeIds = routes.map((r) => r.id)
  const { data: assignments, error: aErr } = await supabase
    .from('bus_assignments')
    .select('*')
    .in('route_id', routeIds)
  if (aErr) throw aErr

  const busIds = Array.from(
    new Set(
      (assignments || [])
        .flatMap((a: any) => [a.primary_bus_id, a.substitute_bus_id])
        .filter(Boolean) as string[]
    )
  )

  const busById: { [key: string]: Bus } = {}
  if (busIds.length) {
    const { data: buses, error: bErr } = await supabase.from('buses').select('*').in('id', busIds)
    if (bErr) throw bErr
    (buses || []).forEach((b: any) => (busById[b.id] = b as Bus))
  }

  const byRoute = {} as { [key: string]: BusAssignment }
  (assignments || []).forEach((a: any) => (byRoute[a.route_id] = a as BusAssignment))

  return routes.map((r) => {
    const a = byRoute[r.id]
    const primary = a?.primary_bus_id ? busById[a.primary_bus_id] : null
    const sub = a?.substitute_bus_id ? busById[a.substitute_bus_id] : null
    let current: Bus | null = null
    if (a) {
      if (a.primary_active) {
        // Prefer primary; if missing, fall back to substitute
        current = primary || sub || null
      } else {
        // Prefer substitute when primary is inactive; fall back to primary
        current = sub || primary || null
      }
    }
    return { ...r, assignment: a, primary_bus: primary, substitute_bus: sub, current_bus: current }
  })
}

export async function listRoutesWithAssignmentByStop(stopId: UUID): Promise<RouteWithAssignment[]> {
  // Reuse full list then filter by stop membership to minimize new SQL
  const all = await listRoutesWithAssignment()
  return all.filter(r => (r.stops || []).some(s => s.id === stopId))
}
