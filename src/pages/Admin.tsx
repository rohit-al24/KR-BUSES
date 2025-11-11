import { useEffect, useState, useRef } from 'react';
import AssignStudentBusPanel from '@/components/AssignStudentBusPanel';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import type { Bus, BusStop, RouteWithStops } from '@/lib/bus';
import { listStops, createStop, deleteStop, listBuses, createBus, setBusActive, deleteBus, createRoute as createRouteDb, listRoutesWithStops, upsertAssignment, updateBus, listRoutesWithAssignment, listRoutesWithAssignmentByStop } from '@/lib/bus';
import type { RouteWithAssignment } from '@/lib/bus';
import { listStudents, updateStudentRoute } from '@/lib/adminStudents';
import { getStudentByRoll, listBusStops, listRoutesWithStop, getCurrentBusForRoute, assignStudentToBus } from '@/lib/adminStudentBus';
import supabase from '@/lib/supabaseClient.js';

type OverviewRow = {
  number: number;
  busNumber: string;
  driver: string;
  capacity: number;
  studentsTotal: number;
  boys: number;
  girls: number;
  staff: number;
};

export default function Admin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const realTableRef = useRef<HTMLTableElement | null>(null);
  const fixedTableRef = useRef<HTMLTableElement | null>(null);
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ number: number; loading: boolean; error?: string; route?: any } | null>(null);

  // New admin management states
  const [stops, setStops] = useState<BusStop[]>([]);
  const [newStopName, setNewStopName] = useState('');
  const [buses, setBuses] = useState<Bus[]>([]);
  const [newBusNumber, setNewBusNumber] = useState('');
  const [newBusCapacity, setNewBusCapacity] = useState<number | ''>('');
  const [routes, setRoutes] = useState<RouteWithStops[]>([]);
  const [routeName, setRouteName] = useState('');
  const [selectedStopIds, setSelectedStopIds] = useState<string[]>([]);
  const [savingRoute, setSavingRoute] = useState(false);
  const [assignRouteId, setAssignRouteId] = useState<string>('');
  const [assignPrimaryBusId, setAssignPrimaryBusId] = useState<string>('');
  const [assignPrimaryActive, setAssignPrimaryActive] = useState(true); // substitute handled per bus now
  const [activePanel, setActivePanel] = useState<'stops' | 'buses' | 'routes' | 'assign' | 'studentAssign' | 'assignStudentBus'>('stops');
  const [routesWithAssign, setRoutesWithAssign] = useState<RouteWithAssignment[]>([]);
  const [busEdits, setBusEdits] = useState<Record<string,string>>({});
  // Student assignment state
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedStopForStudent, setSelectedStopForStudent] = useState<string>('');
  const [filteredRoutes, setFilteredRoutes] = useState<RouteWithAssignment[]>([]);
  const [selectedRouteForStudent, setSelectedRouteForStudent] = useState<string>('');

  // Helpers for managing selections and data refresh
  const refreshAll = async () => {
    try {
      const [s, b, r, stu] = await Promise.all([
        listStops(),
        listBuses(),
        listRoutesWithStops(),
        listStudents(),
      ]);
      setStops(s);
      setBuses(b);
      setRoutes(r);
      setStudents(stu);
      // refresh assignments view too
      const ra = await listRoutesWithAssignment();
      setRoutesWithAssign(ra);
    } catch (e: any) {
      toast({ title: 'Failed to refresh data', description: e?.message, variant: 'destructive' });
    }
  };
  // Update routes filtered by selected stop when stop changes
  useEffect(()=>{
    if(!selectedStopForStudent){ setFilteredRoutes([]); return; }
    (async()=>{
      try { const routes = await listRoutesWithAssignmentByStop(selectedStopForStudent); setFilteredRoutes(routes); }
      catch{}
    })();
  }, [selectedStopForStudent]);

  const refreshAssignments = async () => {
    try {
      const ra = await listRoutesWithAssignment();
      try { console.debug('refreshAssignments()', { count: ra.length, snapshot: ra.map(r=>({ route: r.id, primary: r.assignment?.primary_bus_id, current: r.current_bus?.id, updated_at: r.assignment?.updated_at }))}); } catch {}
      setRoutesWithAssign((prev)=>{
        if (!prev?.length) return ra;
        const prevById: Record<string, RouteWithAssignment> = {} as any;
        prev.forEach(p=>{ prevById[p.id] = p; });
        return ra.map(n=>{
          const old = prevById[n.id];
          if (!old) return n;
          const oldTs = old.assignment?.updated_at ? Date.parse(old.assignment.updated_at) : 0;
          const newTs = n.assignment?.updated_at ? Date.parse(n.assignment.updated_at) : 0;
          // If server returns no assignment yet or older data, keep the newer local snapshot
          if ((n.assignment == null && old.assignment != null) || oldTs > newTs) {
            return { ...n, assignment: old.assignment, primary_bus: old.primary_bus, substitute_bus: old.substitute_bus, current_bus: old.current_bus };
          }
          return n;
        });
      });
    } catch (e:any) {
      // non-fatal
    }
  };

  const addStopToSelection = (id: string) => {
    setSelectedStopIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const removeStopFromSelection = (id: string) => {
    setSelectedStopIds((prev) => prev.filter((x) => x !== id));
  };

  const moveStop = (id: string, delta: number) => {
    setSelectedStopIds((prev) => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      const next = [...prev];
      const newIdx = Math.max(0, Math.min(prev.length - 1, idx + delta));
      next.splice(idx, 1);
      next.splice(newIdx, 0, id);
      return next;
    });
  };

  const handleLogout = () => {
    try { localStorage.removeItem('session'); } catch {}
    navigate('/login');
  };

  // Initial load of admin data
  useEffect(() => { refreshAll(); }, []);
  useEffect(() => { refreshAssignments(); }, []);
  // Realtime updates for bus assignments
  useEffect(() => {
    const channel = supabase
      .channel('bus_assignments_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bus_assignments' }, (_payload: any) => {
        // slight debounce by scheduling a refresh soon
        setTimeout(()=>{ refreshAssignments(); }, 250);
      })
      .subscribe();
    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, []);
  useEffect(() => {
    // keep editable names in sync
    const m: Record<string,string> = {};
    buses.forEach(b=>{ m[b.id] = b.bus_number; });
    setBusEdits(m);
  }, [buses]);

  // Poll attendance for the selected route so admins see coordinator submissions in near real-time
  useEffect(() => {
    if (!selected || !selected.number) return;
    let mounted = true;
    let timer: any = null;

    const fetchAttendance = async () => {
      try {
        const resp = await fetch(`/routes/${selected.number}/attendance`);
        if (!mounted) return;
        if (!resp.ok) return; // ignore errors during polling
        const ct = resp.headers.get('content-type') || '';
        if (!ct.includes('application/json')) return;
        const json = await resp.json();
        if (json && json.success) {
          setSelected((prev) => (prev && prev.number === selected.number ? { ...prev, route: { ...(prev.route || {}), attendance: json.attendance || [] } } : prev));
        }
      } catch (e) {
        // swallow polling errors silently
      }
    };

    // initial fetch and then poll every 8s
    fetchAttendance();
    timer = setInterval(fetchAttendance, 8000);

    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, [selected]);
  // legacy overview summary (still used for selected route details panel) - keep existing rows summary below original table
  const summary = rows.reduce(
    (acc, r) => ({
      buses: acc.buses + 1,
      students: acc.students + (r.studentsTotal || 0),
      boys: acc.boys + (r.boys || 0),
      girls: acc.girls + (r.girls || 0),
      staff: acc.staff + (r.staff || 0),
    }),
    { buses: 0, students: 0, boys: 0, girls: 0, staff: 0 }
  );

  return (
    <>
      <div className="fixed inset-0 bg-gradient-to-b from-slate-50 via-white to-sky-50 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Admin — Bus Overview</h1>
              <p className="text-sm text-slate-500 mt-1">Manage buses, stops, routes and assignments.</p>
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" variant="secondary" onClick={handleLogout} className="text-sm">Logout</Button>
            </div>
          </div>

          {/* Summary dashboard at top */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
            <Card className="p-4"><CardHeader><CardTitle className="text-sm font-semibold">Stops</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stops.length}</div><div className="text-xs text-slate-500">Total stops</div></CardContent></Card>
            <Card className="p-4"><CardHeader><CardTitle className="text-sm font-semibold">Buses</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{buses.length}</div><div className="text-xs text-slate-500">Total buses</div></CardContent></Card>
            <Card className="p-4"><CardHeader><CardTitle className="text-sm font-semibold">Routes</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{routes.length}</div><div className="text-xs text-slate-500">Defined routes</div></CardContent></Card>
            <Card className="p-4"><CardHeader><CardTitle className="text-sm font-semibold">Students</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{summary.students}</div><div className="text-xs text-slate-500">Assigned students</div></CardContent></Card>
          </div>

          {/* Panel buttons */}
          <div className="flex flex-wrap gap-3 mb-6">
            <Button variant={activePanel==='stops'?'default':'outline'} size="sm" onClick={()=>setActivePanel('stops')}>Bus Stops</Button>
            <Button variant={activePanel==='buses'?'default':'outline'} size="sm" onClick={()=>setActivePanel('buses')}>Buses</Button>
            <Button variant={activePanel==='routes'?'default':'outline'} size="sm" onClick={()=>setActivePanel('routes')}>Routes</Button>
            <Button variant={activePanel==='assign'?'default':'outline'} size="sm" onClick={()=>setActivePanel('assign')}>Assign Bus</Button>
            <Button variant={activePanel==='studentAssign'?'default':'outline'} size="sm" onClick={()=>setActivePanel('studentAssign')}>Assign Student Bus</Button>
            <Button variant={activePanel==='assignStudentBus'?'default':'outline'} size="sm" onClick={()=>setActivePanel('assignStudentBus')}>Assign by Roll No</Button>
          </div>

          {/* Panels */}
          {activePanel === 'stops' && (
            <Card className="mb-8"><CardHeader><CardTitle className="text-sm font-semibold">Bus Stops</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex items-end gap-3"><div className="flex-1"><Label htmlFor="new-stop">New stop name</Label><Input id="new-stop" value={newStopName} onChange={(e)=>setNewStopName(e.target.value)} placeholder="e.g. Chitram"/></div><Button onClick={async()=>{if(!newStopName.trim())return;try{await createStop(newStopName.trim());setNewStopName('');await refreshAll();toast({title:'Stop added'})}catch(e:any){toast({title:'Failed to add stop',description:e?.message,variant:'destructive'})}}}>Add</Button></div><div className="grid grid-cols-2 md:grid-cols-4 gap-2">{stops.map(s=>(<div key={s.id} className="flex items-center justify-between rounded border p-2 text-sm"><div>{s.name}</div><Button size="sm" variant="ghost" onClick={async()=>{await deleteStop(s.id);await refreshAll();}}>Delete</Button></div>))}{!stops.length&&<div className="text-xs text-slate-500">No stops yet</div>}</div></CardContent></Card>
          )}
          {activePanel === 'buses' && (
            <Card className="mb-8"><CardHeader><CardTitle className="text-sm font-semibold">Buses</CardTitle></CardHeader><CardContent className="space-y-5"><div className="grid grid-cols-2 md:grid-cols-3 gap-3 items-end"><div><Label htmlFor="bus-number">Bus number</Label><Input id="bus-number" value={newBusNumber} onChange={(e)=>setNewBusNumber(e.target.value)} placeholder="e.g. 7"/></div><div><Label htmlFor="bus-capacity">Capacity (optional)</Label><Input id="bus-capacity" type="number" value={newBusCapacity} onChange={(e)=>setNewBusCapacity(e.target.value?Number(e.target.value):'')} placeholder="e.g. 50"/></div><div><Button onClick={async()=>{if(!newBusNumber.trim())return;try{await createBus(newBusNumber.trim(),typeof newBusCapacity==='number'?newBusCapacity:undefined);setNewBusNumber('');setNewBusCapacity('');await refreshAll();toast({title:'Bus added'})}catch(e:any){toast({title:'Failed to add bus',description:e?.message,variant:'destructive'})}}}>Add</Button></div></div><div className="space-y-3">{buses.map(b=>{return (<div key={b.id} className="rounded border p-3 bg-white flex flex-col gap-3"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="text-xs text-slate-500">ID {b.id.slice(0,8)}</div><div className="text-xs ${b.active?'text-emerald-600':'text-slate-400'}">{b.active?'active':'inactive'}</div></div><div className="flex items-center gap-2"><Button size="sm" variant="secondary" onClick={async()=>{await setBusActive(b.id,!b.active);await refreshAll();}}>{b.active?'Deactivate':'Activate'}</Button><Button size="sm" variant="ghost" onClick={async()=>{await deleteBus(b.id);await refreshAll();}}>Delete</Button></div></div><div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"><div><Label className="text-xs" htmlFor={`edit-bus-${b.id}`}>Bus number</Label><Input id={`edit-bus-${b.id}`} value={busEdits[b.id] ?? ''} onChange={(e)=>setBusEdits(prev=>({...prev,[b.id]:e.target.value}))} placeholder="e.g. 16"/></div><div className="md:col-span-2 flex gap-2"><Button size="sm" onClick={async()=>{const name=(busEdits[b.id]||'').trim(); if(!name) return; try{await updateBus(b.id,{ bus_number: name }); await refreshAll(); toast({title:'Bus updated'});}catch(e:any){toast({title:'Failed to update bus',description:e?.message,variant:'destructive'})}}}>Save</Button><div className="text-sm font-medium">Current: <span className="font-bold">{b.bus_number}</span></div></div></div></div>)})}{!buses.length&&<div className="text-xs text-slate-500">No buses yet</div>}</div></CardContent></Card>
          )}
          {activePanel === 'routes' && (
            <Card className="mb-8"><CardHeader><CardTitle className="text-sm font-semibold">Create Route</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-1 md:grid-cols-3 gap-3"><div className="md:col-span-1"><Label>Route name</Label><Input value={routeName} onChange={(e)=>setRouteName(e.target.value)} placeholder="e.g. Chitram to TV kovil"/></div></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><div className="text-sm font-medium mb-2">Available Stops</div><div className="space-y-2 max-h-64 overflow-auto">{stops.map(s=>(<div key={s.id} className="flex items-center justify-between rounded border p-2"><div className="text-sm">{s.name}</div><Button size="sm" variant="secondary" onClick={()=>addStopToSelection(s.id)} disabled={selectedStopIds.includes(s.id)}>Add</Button></div>))}{!stops.length&&<div className="text-xs text-slate-500">No stops</div>}</div></div><div><div className="text-sm font-medium mb-2">Selected Stops (ordered)</div><div className="space-y-2 max-h-64 overflow-auto">{selectedStopIds.map(id=>{const s=stops.find(x=>x.id===id);if(!s)return null;return(<div key={id} className="flex items-center justify-between rounded border p-2"><div className="text-sm">{s.name}</div><div className="flex items-center gap-2"><Button size="sm" variant="secondary" onClick={()=>moveStop(id,-1)}>Up</Button><Button size="sm" variant="secondary" onClick={()=>moveStop(id,1)}>Down</Button><Button size="sm" variant="ghost" onClick={()=>removeStopFromSelection(id)}>Remove</Button></div></div>)})}{!selectedStopIds.length&&<div className="text-xs text-slate-500">No stops selected</div>}</div></div></div><div><Button disabled={!selectedStopIds.length||savingRoute} onClick={async()=>{try{setSavingRoute(true);let finalName=routeName.trim();if(!finalName){const first=stops.find(s=>s.id===selectedStopIds[0]);const last=stops.find(s=>s.id===selectedStopIds[selectedStopIds.length-1]);finalName=[first?.name,last?.name].filter(Boolean).join(' to ');if(!finalName)finalName=`Route ${new Date().toISOString().slice(0,10)}`;}await createRouteDb(finalName,selectedStopIds);setRouteName('');setSelectedStopIds([]);await refreshAll();toast({title:'Route created'})}catch(e:any){toast({title:'Failed to create route',description:e?.message,variant:'destructive'})}finally{setSavingRoute(false)}}}>Save Route</Button></div></CardContent></Card>
          )}
          {activePanel === 'assign' && (
            <Card className="mb-4">
              <CardHeader><CardTitle className="text-sm font-semibold">Assign Bus to Route</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div>
                    <Label>Route</Label>
                    <Select value={assignRouteId} onValueChange={setAssignRouteId}>
                      <SelectTrigger><SelectValue placeholder="Select route"/></SelectTrigger>
                      <SelectContent>{routes.map(r=>(<SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Primary Bus</Label>
                    <Select value={assignPrimaryBusId} onValueChange={setAssignPrimaryBusId}>
                      <SelectTrigger><SelectValue placeholder="Select primary"/></SelectTrigger>
                      <SelectContent>{buses.filter(b=>b.active).map(b=>(<SelectItem key={b.id} value={b.id}>{b.bus_number}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-3 mt-6">
                    <Checkbox id="primary-active" checked={assignPrimaryActive} onCheckedChange={(v:any)=>setAssignPrimaryActive(!!v)}/>
                    <Label htmlFor="primary-active">Primary bus available</Label>
                  </div>
                </div>
                <div>
                  <Button disabled={!assignRouteId||!assignPrimaryBusId} onClick={async()=>{
                    try {
                      const a = await upsertAssignment({route_id:assignRouteId,primary_bus_id:assignPrimaryBusId,primary_active:assignPrimaryActive});
                      setRoutesWithAssign(prev=>prev.map(r=>{
                        if(r.id!==assignRouteId) return r;
                        const primary = buses.find(b=>b.id===(a.primary_bus_id || assignPrimaryBusId)) || null;
                        const current = a.primary_active ? (primary || r.substitute_bus || null) : (r.substitute_bus || primary || null);
                        return { ...r, assignment: { ...(r.assignment||{}), ...a }, primary_bus: primary, current_bus: current };
                      }));
                      setTimeout(()=>{ refreshAssignments(); }, 1200);
                      toast({title:'Assignment saved'});
                    } catch(e:any) {
                      toast({title:'Failed to save assignment',description:e?.message,variant:'destructive'});
                    }
                  }}>Save Assignment</Button>
                </div>
                <div className="px-2 text-[11px] text-slate-500">{`debug: routes=${routesWithAssign.length}`}</div>
              </CardContent>
            </Card>
          )}
          {activePanel === 'studentAssign' && (
            <Card className="mb-8">
              <CardHeader><CardTitle className="text-sm font-semibold">Assign Bus To Student</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label>Student</Label>
                    <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                      <SelectTrigger><SelectValue placeholder="Select student"/></SelectTrigger>
                      <SelectContent>{students.map(st=>(<SelectItem key={st.id} value={st.id}>{st.roll_no} — {st.full_name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Bus Stop</Label>
                    <Select value={selectedStopForStudent} onValueChange={(v)=>{ setSelectedStopForStudent(v); setSelectedRouteForStudent(''); }}>
                      <SelectTrigger><SelectValue placeholder="Select stop"/></SelectTrigger>
                      <SelectContent>{stops.map(sp=>(<SelectItem key={sp.id} value={sp.id}>{sp.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Route (filtered by stop)</Label>
                    <Select value={selectedRouteForStudent} onValueChange={setSelectedRouteForStudent}>
                      <SelectTrigger><SelectValue placeholder={selectedStopForStudent? 'Select route':'Pick stop first'}/></SelectTrigger>
                      <SelectContent>{filteredRoutes.map(fr=>(<SelectItem key={fr.id} value={fr.id}>{fr.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="pt-2">
                  <Button
                    disabled={!selectedStudentId || !selectedStopForStudent || !selectedRouteForStudent}
                    onClick={async()=>{
                      try {
                        await updateStudentRoute(selectedStudentId, selectedRouteForStudent, selectedStopForStudent)
                        toast({ title: 'Student assigned to route' })
                        setSelectedStudentId('');
                        setSelectedStopForStudent('');
                        setSelectedRouteForStudent('');
                        refreshAll();
                      } catch(e:any){
                        toast({ title: 'Failed to assign', description: e?.message, variant: 'destructive' })
                      }
                    }}
                  >Assign Bus</Button>
                </div>
                <div className="text-xs text-slate-500">Filtered routes show only those containing the chosen stop. Bus shown to student is the current bus for that route.</div>
              </CardContent>
            </Card>
          )}

          {/* New: Assign Student to Bus by Roll Number */}
          {activePanel === 'assignStudentBus' && (
            <Card className="mb-8">
              <CardHeader><CardTitle className="text-sm font-semibold">Assign Student to Bus (by Roll No)</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <AssignStudentBusPanel />
              </CardContent>
            </Card>
          )}

// --- New Panel Component ---

import AssignStudentBusPanel from '@/components/AssignStudentBusPanel';
          {activePanel === 'assign' && (
            <div className="mb-8 border rounded-lg bg-white shadow-sm">
              <div className="px-5 py-3 border-b flex items-center justify-between">
                <div className="text-sm font-medium text-slate-700">Routes overview</div>
                <div className="text-xs text-slate-500">{routesWithAssign.length} total</div>
              </div>
              <div className="p-4 space-y-3">
                {routesWithAssign.map(rwa=>{ const usingSub = rwa.assignment && !rwa.assignment.primary_active && rwa.substitute_bus; const busLabel = rwa.current_bus? rwa.current_bus.bus_number : (rwa.primary_bus?.bus_number || rwa.substitute_bus?.bus_number || 'Not Assigned'); const stops = rwa.stops.map(s=>s.name).join(' • '); return (
                  <div key={rwa.id} className="group rounded-md border bg-slate-50 hover:bg-sky-50 transition-colors">
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-900">{rwa.name}</div>
                        <div className="text-xs text-slate-600 mt-1 truncate max-w-[60ch]">{stops}</div>
                      </div>
                      <div className={`text-xl font-bold tracking-wide ${rwa.current_bus ? (rwa.substitute_bus && rwa.current_bus?.id===rwa.substitute_bus.id ? 'text-amber-600' : 'text-sky-600') : 'text-slate-400'}`}>{busLabel}{rwa.current_bus && rwa.substitute_bus && rwa.current_bus?.id===rwa.substitute_bus.id ? ' • SUB' : ''}</div>
                    </div>
                  </div>
                )})}
                {!routesWithAssign.length && <div className="text-xs text-slate-500">No routes yet</div>}
              </div>
            </div>
          )}
          {/* Removed duplicate summary card block below panels */}

          <div ref={tableScrollRef} className="bg-white rounded-lg shadow-sm border overflow-auto min-h-0">
            <div id="fixed-header" style={{position: 'fixed', top: 0, left: 0, right: 0, zIndex: 60}} className="bg-white border-b">
              <div className="px-4 py-4 flex items-center justify-between">
                <div className="text-sm font-medium text-slate-700">Routes</div>
                <div className="flex items-center gap-3">
                  <div className="text-xs text-slate-500">Showing {rows.length} routes</div>
                  <Button size="sm" variant="secondary" onClick={handleLogout} className="text-sm">Logout</Button>
                </div>
              </div>
              <div>
                <Table ref={fixedTableRef} className="min-w-full">
                  <TableHeader>
                    <TableRow>
                          <TableHead className="text-sm font-medium text-slate-800 text-left">Route</TableHead>
                          <TableHead className="text-sm text-slate-700 text-left">Bus</TableHead>
                          <TableHead className="text-sm text-slate-700 text-left">Driver</TableHead>
                          <TableHead className="text-sm text-slate-600 text-right pr-6">Capacity</TableHead>
                          <TableHead className="text-sm text-slate-800 text-right pr-6">Students</TableHead>
                          <TableHead className="text-sm text-sky-600 text-right">Boys</TableHead>
                          <TableHead className="text-sm text-pink-600 text-right">Girls</TableHead>
                          <TableHead className="text-sm text-emerald-600 text-right">Staff</TableHead>
                        </TableRow>
                  </TableHeader>
                </Table>
              </div>
            </div>

            <Table ref={realTableRef} className="min-w-full">
              <TableHeader className="invisible">
                <TableRow>
                  <TableHead className="text-sm font-medium text-slate-800 text-left">Route</TableHead>
                  <TableHead className="text-sm text-slate-700 text-left">Bus</TableHead>
                  <TableHead className="text-sm text-slate-700 text-left">Driver</TableHead>
                  <TableHead className="text-sm text-slate-600 text-right pr-6">Capacity</TableHead>
                  <TableHead className="text-sm text-slate-800 text-right pr-6">Total Students</TableHead>
                  <TableHead className="text-sm text-sky-600 text-right">Boys</TableHead>
                  <TableHead className="text-sm text-pink-600 text-right">Girls</TableHead>
                  <TableHead className="text-sm text-emerald-600 text-right">Staff</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, idx) => (
                  <TableRow key={r.number} onClick={async () => {
                      setSelected({ number: r.number, loading: true });
                      try {
                        const resp = await fetch(`/routes/${r.number}`);
                        if (!resp.ok) {
                          const txt = await resp.text();
                          setSelected({ number: r.number, loading: false, error: txt || `Failed to load (${resp.status})` });
                          return;
                        }
                        const ct = resp.headers.get('content-type') || '';
                        if (!ct.includes('application/json')) {
                          const txt = await resp.text();
                          setSelected({ number: r.number, loading: false, error: txt || 'Server returned non-JSON' });
                          return;
                        }
                        const json = await resp.json();
                        if (json && json.success) setSelected({ number: r.number, loading: false, route: json.route });
                        else setSelected({ number: r.number, loading: false, error: json?.message || 'Failed to load' });
                      } catch (e: any) {
                        setSelected({ number: r.number, loading: false, error: e?.message || 'Network error' });
                      }
                    }}
                    className={
                      "cursor-pointer transition-colors duration-150 ease-in-out " +
                      (idx % 2 === 0
                        ? 'bg-white hover:bg-sky-50 hover:shadow-sm hover:scale-[1.001]'
                        : 'bg-slate-50 hover:bg-sky-100 hover:shadow-sm hover:scale-[1.001]')
                    }
                    role="button"
                    aria-label={`Open route ${r.number} details`}
                  >
                    <TableCell className="text-sm font-medium text-slate-800">{r.number}</TableCell>
                    <TableCell className="text-sm text-slate-700">{r.busNumber}</TableCell>
                    <TableCell className="text-sm text-slate-700">{r.driver}</TableCell>
                    <TableCell className="text-sm text-slate-600 text-right pr-6">{r.capacity}</TableCell>
                    <TableCell className="text-sm text-slate-800 text-right pr-6">{r.studentsTotal}</TableCell>
                    <TableCell className="text-sm text-sky-600 text-right">{r.boys}</TableCell>
                    <TableCell className="text-sm text-pink-600 text-right">{r.girls}</TableCell>
                    <TableCell className="text-sm text-emerald-600 text-right">{r.staff}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Right-hand details panel (small tab) shown when a route is selected */}
      {selected && (
        <div className="hidden md:block">
          <div className="fixed right-6 top-28 z-50">
            <div className="w-96 max-h-[78vh] overflow-auto bg-white border rounded-2xl shadow-lg">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <div>
                  <div className="text-sm font-semibold">Route {selected.number}</div>
                  <div className="text-xs text-slate-500">Details & latest attendance</div>
                </div>
                <div>
                  <button className="text-sm px-3 py-1 rounded bg-slate-100 hover:bg-slate-200" onClick={() => setSelected(null)}>Close</button>
                </div>
              </div>
              <div className="p-4">
                {selected.loading ? (
                  <div>Loading...</div>
                ) : selected.error ? (
                  <div className="text-destructive">{selected.error}</div>
                ) : (
                  <div className="space-y-4 text-sm">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-slate-500">Bus</div>
                        <div className="text-sm font-medium">{selected.route?.busNumber || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Driver</div>
                        <div className="text-sm font-medium">{selected.route?.driver || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Capacity</div>
                        <div className="text-sm font-medium">{selected.route?.capacity || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Students</div>
                        <div className="text-sm font-medium">{(selected.route?.students || []).length}</div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500 mb-2">Staff</div>
                      <div className="space-y-2">
                        {(selected.route?.staff || []).map((f: any) => (
                          <div key={f.id} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700">{(f.name || '?').slice(0,1)}</div>
                              <div>{f.name}</div>
                            </div>
                            <div className="text-xs text-slate-500">{f.seatNumber ? `Seat ${f.seatNumber}` : '—'}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500 mb-2">Students (sample)</div>
                      <div className="space-y-2 max-h-40 overflow-auto">
                        {(selected.route?.students || []).slice(0,40).map((s: any) => (
                          <div key={s.id} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700">{(s.name || '?').slice(0,1)}</div>
                              <div className="truncate">
                                <span className={
                                  s.gender === 'female' ? 'text-pink-600 font-semibold' : s.gender === 'male' ? 'text-sky-700 font-semibold' : ''
                                }>{s.name}</span>
                              </div>
                            </div>
                            <div className="text-xs text-slate-500">{s.seatNumber ? `Seat ${s.seatNumber}` : '—'}</div>
                          </div>
                        ))}
                        {!(selected.route?.students || []).length && <div className="text-xs text-slate-400">No students listed</div>}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500 mb-2">Recent attendance</div>
                      <div className="space-y-2 text-sm">
                        {(selected.route?.attendance || []).slice().reverse().slice(0,6).map((a: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between">
                            <div className="text-sm">{a.date}</div>
                            <div className="text-sm font-medium">{a.count} students</div>
                          </div>
                        ))}
                        {!((selected.route?.attendance || []).length) && <div className="text-xs text-slate-400">No attendance submitted yet</div>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
