import React from 'react';
import { useToast } from '@/components/ui/use-toast';
import { getStudentByRoll, listBusStops, listRoutesWithStop, getCurrentBusForRoute, assignStudentToBus } from '@/lib/adminStudentBus';

export default function AssignStudentBusPanel() {
  const { toast } = useToast();
  const [rollInput, setRollInput] = React.useState("");
  const [student, setStudent] = React.useState<any>(null);
  const [busStops, setBusStops] = React.useState<any[]>([]);
  const [selectedStop, setSelectedStop] = React.useState("");
  const [routes, setRoutes] = React.useState<any[]>([]);
  const [selectedRoute, setSelectedRoute] = React.useState("");
  const [bus, setBus] = React.useState<any>(null);
  const [year, setYear] = React.useState("");
  const [gender, setGender] = React.useState("");
  const [feesPaid, setFeesPaid] = React.useState(false);
  const [assignLoading, setAssignLoading] = React.useState(false);

  React.useEffect(() => { listBusStops().then(setBusStops).catch(() => setBusStops([])); }, []);
  React.useEffect(() => {
    if (selectedStop) {
      listRoutesWithStop(selectedStop).then(setRoutes).catch(() => setRoutes([]));
    } else {
      setRoutes([]);
    }
    setSelectedRoute("");
    setBus(null);
  }, [selectedStop]);
  React.useEffect(() => {
    if (selectedRoute) {
      getCurrentBusForRoute(selectedRoute).then(setBus).catch(() => setBus(null));
    } else {
      setBus(null);
    }
  }, [selectedRoute]);

  const handleRollCheck = async () => {
    setStudent(null);
    try {
      const s = await getStudentByRoll(rollInput);
      setStudent(s);
      toast({ title: "Student found", description: s.name });
    } catch {
      toast({ title: "Student not found", variant: "destructive" });
    }
  };

  const handleAssign = async () => {
    if (!student || !selectedStop || !selectedRoute || !year || !gender || !bus) {
      toast({ title: "Fill all fields", variant: "destructive" });
      return;
    }
    setAssignLoading(true);
    try {
      // Only allow 'male' or 'female' (lowercase) for DB
      const genderDb = gender.toLowerCase();
      await assignStudentToBus(student.id, selectedStop, selectedRoute, Number(year), genderDb, feesPaid, bus.id);
      toast({ title: "Student assigned to bus" });
      setRollInput(""); setStudent(null); setSelectedStop(""); setSelectedRoute(""); setBus(null); setYear(""); setGender(""); setFeesPaid(false);
    } catch (err) {
      console.error('Assignment failed:', err);
      toast({ title: "Assignment failed", variant: "destructive" });
    }
    setAssignLoading(false);
  };

  return (
    <div className="border rounded-lg p-4 bg-white shadow">
      <h2 className="text-lg font-bold mb-2">Assign Student to Bus</h2>
      <div className="flex flex-col gap-2">
        <label>Roll Number</label>
        <div className="flex gap-2">
          <input className="border px-2 py-1 rounded" value={rollInput} onChange={e => setRollInput(e.target.value)} placeholder="Enter roll number" />
          <button className="bg-blue-500 text-white px-3 py-1 rounded" onClick={handleRollCheck}>Check</button>
        </div>
        {student && (
          <div className="bg-gray-100 p-2 rounded mt-2">
            <div><b>Name:</b> {student.full_name}</div>
            <div><b>Roll No:</b> {student.roll_no}</div>
            <div><b>Gender:</b> {student.gender || ''}</div>
          </div>
        )}
        {student && (
          <>
            <label className="mt-2">Bus Stop</label>
            <select className="border px-2 py-1 rounded" value={selectedStop} onChange={e => setSelectedStop(e.target.value)}>
              <option value="">Select stop</option>
              {busStops.map(stop => (
                <option key={stop.id} value={stop.id}>{stop.name}</option>
              ))}
            </select>
            {selectedStop && (
              <>
                <label className="mt-2">Route</label>
                <select className="border px-2 py-1 rounded" value={selectedRoute} onChange={e => setSelectedRoute(e.target.value)}>
                  <option value="">Select route</option>
                  {routes.map(route => (
                    <option key={route.id} value={route.id}>{route.name}</option>
                  ))}
                </select>
              </>
            )}
            {bus && (
              <div className="bg-gray-50 p-2 rounded mt-2">
                <div><b>Bus Number:</b> {bus.bus_no}</div>
                <div><b>Driver:</b> {bus.driver_name}</div>
              </div>
            )}
            <label className="mt-2">Year</label>
            <input className="border px-2 py-1 rounded" value={year} onChange={e => setYear(e.target.value)} placeholder="Year" />
            <label className="mt-2">Gender</label>
            <select className="border px-2 py-1 rounded" value={gender} onChange={e => setGender(e.target.value)}>
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" checked={feesPaid} onChange={e => setFeesPaid(e.target.checked)} /> Fees Paid
            </label>
            <button className="bg-green-600 text-white px-3 py-1 rounded mt-2" onClick={handleAssign} disabled={assignLoading}>{assignLoading ? "Assigning..." : "Assign Student to Bus"}</button>
          </>
        )}
      </div>
    </div>
  );
}