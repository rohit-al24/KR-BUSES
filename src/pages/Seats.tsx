import React, { useEffect, useState } from "react";
import supabase from "@/lib/supabaseClient.js";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bus, LogOut, MapPin } from "lucide-react";
import ErrorBoundary from "../components/ErrorBoundary";

type SeatType = "faculty" | "girl" | "boy" | "user" | "available";

interface Seat {
  number: number;
  type: SeatType;
  occupiedBy?: string;
  occupiedGender?: string | null;
}

const Seats = () => {
  const navigate = useNavigate();
  const [userName, setUserName] = useState("");
  const [userType, setUserType] = useState("");
  const [driverName, setDriverName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [userSeatNumberState, setUserSeatNumberState] = useState<number | null>(null);
  const [attendanceDate, setAttendanceDate] = useState('');
  const [attendanceCount, setAttendanceCount] = useState<number | ''>('');
  const [attendanceStatus, setAttendanceStatus] = useState<string | null>(null);
  const [assignedStop, setAssignedStop] = useState<string | null>(null);
  const [assignedBusNumber, setAssignedBusNumber] = useState<string | null>(null);
  const [debugStudentId, setDebugStudentId] = useState<string | null>(null);
  const [debugSbdResult, setDebugSbdResult] = useState<any>(null);

  useEffect(() => {
    // Initialize component state and compute a deterministic seat for the logged-in user.
    const init = async () => {
      // Use new profile storage (localStorage key 'profile') populated on login
      const profileJson = localStorage.getItem('profile');
      let profile: any = null;
      try { profile = profileJson ? JSON.parse(profileJson) : null; } catch(e){ console.warn('Bad profile JSON', e); }

      // Also get authenticated user from supabase session (for UUID/email)
      const session = await supabase?.auth.getSession();
      const authUser = session?.data.session?.user || null;

      const name = profile?.full_name || profile?.email || authUser?.email || localStorage.getItem('userName') || '';
      const rawRole = profile?.role || localStorage.getItem('userType') || 'student';

      if (!authUser?.email) {
        navigate('/');
        return;
      }
      setUserName(name);
      const type = rawRole === 'staff' ? 'faculty' : rawRole;
      setUserType(type);

      // Map auth email -> students.id (students table is separate from auth.users)
      const { data: studentRow, error: studentErr } = await supabase
        .from('students')
        .select('id, full_name, email')
        .eq('email', authUser.email)
        .maybeSingle();
      if (studentErr) {
        console.warn('students lookup error', studentErr);
      }
      const studentId: string | null = studentRow?.id || null;
      if (studentRow?.full_name) setUserName(studentRow.full_name);

      // Attempt to fetch student_bus_details using student_id from students table
      setDebugStudentId(studentId);
      let assignedStopName: string | null = null;
      let assignedBusNum: string | null = null;
      let userSeatNumber: number | null = type === 'faculty' ? null : 10;

      // Join in one call; pick the most recent row for the student
      const { data: detail, error: detailErr } = await supabase
        .from('student_bus_details')
        .select('id, bus_id, boarding_point_id, updated_at, bus:buses(bus_number), stop:bus_stops(name)')
        .eq('student_id', studentId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setDebugSbdResult({ data: detail, error: detailErr });
      if (detailErr) {
        // If policy blocks (RLS), surface it for debugging.
        console.warn('student_bus_details fetch error', detailErr);
      } else if (detail) {
        assignedBusNum = (detail as any)?.bus?.bus_number || null;
        assignedStopName = (detail as any)?.stop?.name || null;
        if (assignedBusNum) setAssignedBusNumber(assignedBusNum);
        if (assignedStopName) setAssignedStop(assignedStopName);
      }

      // Seat / driver legacy fallback; routeNumber not stored in profile currently
      const routeResult = await computeUserSeatAndDriver(
        type,
        null,
        authUser?.email || profile?.email || null,
        studentId,
        name
      );
      userSeatNumber = routeResult.seatNumber;
      setDriverName(routeResult.driver || '');
      setUserSeatNumberState(userSeatNumber);
      setSeats(buildSeatsFromRoute(routeResult.route, userSeatNumber, name, type));
    };

    init().catch((err) => {
      console.error('Seats init error', err);
      setErrorMessage(err?.message || String(err));
    });
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("profile");
    localStorage.removeItem("userName");
    localStorage.removeItem("userType");
    navigate("/");
  };

  const getSeatColor = (type: SeatType) => {
    switch (type) {
      case "faculty":
        return "bg-seat-faculty/60 hover:bg-seat-faculty/80";
      case "girl":
        return "bg-seat-girl/60 hover:bg-seat-girl/80";
      case "boy":
        return "bg-seat-boy/60 hover:bg-seat-boy/80";
      case "user":
        // keep user seat prominent but slightly softer than full-saturation
        return "bg-seat-user/90 hover:bg-seat-user/100 ring-4 ring-accent/50";
      case "available":
        return "bg-seat-available/50 hover:bg-seat-available/75";
      default:
        return "bg-seat-occupied";
    }
  };

  // (no display-number remapping)
  // build initial seats array in a pure helper to keep `init` smaller
  // Build seats array from route object. This uses assigned seatNumber and gender on students/staff
  const buildSeatsFromRoute = (route: any, userSeatNumber: number | null, name: string | null, userType: string): Seat[] => {
    const seatsOut: Seat[] = [];

    const defaultTypeByNumber = (n: number): SeatType => {
      if (n >= 1 && n <= 5) return 'faculty';
      if (n >= 6 && n <= 15) return 'girl';
      if (n >= 16 && n <= 40) return 'boy';
      if (n >= 41 && n <= 50) return 'available';
      if (n === 51) return 'available';
      if (n >= 52 && n <= 57) return 'boy';
      return 'available';
    };

    for (let i = 1; i <= 57; i++) {
      const staffAssigned = (route?.staff || []).find((s: any) => s.seatNumber === i);
      const studentAssigned = (route?.students || []).find((s: any) => s.seatNumber === i);

      // Default to an available seat. We will mark it as faculty/student/user only when
      // there is an assigned record. This makes intentionally skipped buffer seats show
      // as empty/available instead of inheriting a gender default color.
      let seatType: SeatType = 'available';
      let occupied: string | undefined = undefined;
      let occupiedGender: string | null = null;

      // Only treat a seat as the logged-in user's seat when the user is not faculty/admin.
      if (userType !== 'faculty' && userSeatNumber !== null && i === userSeatNumber) {
        seatType = 'user';
        occupied = name || undefined;
      } else if (staffAssigned) {
        seatType = 'faculty';
        occupied = staffAssigned.name;
      } else if (studentAssigned) {
        seatType = studentAssigned.gender === 'female' ? 'girl' : 'boy';
        occupied = studentAssigned.name;
        occupiedGender = studentAssigned.gender || null;
      }

      seatsOut.push({ number: i, type: seatType, occupiedBy: occupied, occupiedGender });
    }

    return seatsOut;
  };

  // compute user seat and driver from route
  async function computeUserSeatAndDriver(type: string, routeNumber: number | null, userEmail: string | null, userId: string | null, name: string | null): Promise<{ seatNumber: number | null; driver: string; route: any }> {
    // Faculty/admin are monitors and should not be assigned seats (null). Students get a fallback seat.
    let userSeatNumber: number | null = type === 'faculty' ? null : 10;
    let driver = '';
    let routeObj: any = null;
    if (type !== 'faculty' && routeNumber) {
      try {
        const resp = await fetch(`/routes/${routeNumber}`);
        if (resp.ok) {
          const data = await resp.json();
          routeObj = data?.route || null;
          const studentsList = routeObj?.students || [];
          driver = routeObj?.driver || '';

          // prefer explicit seatNumber if present on student records
          const idxBySeat = studentsList.findIndex((s: any) => s.email === userEmail || s.id === userId || s.name === name);
          if (idxBySeat >= 0 && studentsList[idxBySeat].seatNumber) {
            userSeatNumber = studentsList[idxBySeat].seatNumber;
          } else {
            // fallback to deterministic hash-based seat if not found
            const idx = studentsList.findIndex((s: any) => {
              if (userEmail && s.email) return s.email === userEmail;
              if (userId && s.id) return s.id === userId;
              return s.name === name;
            });
            if (idx >= 0) {
              userSeatNumber = 6 + idx;
              if (userSeatNumber > 57) userSeatNumber = 57;
            } else if (userEmail) {
              let hash = 0;
              for (let i = 0; i < userEmail.length; i++) {
                hash = (hash << 5) - hash + (userEmail.codePointAt(i) || 0);
                hash = Math.trunc(hash);
              }
              const offset = Math.abs(hash) % (57 - 6 + 1);
              userSeatNumber = 6 + offset;
            }
          }
        }
      } catch (e) {
        console.warn('Unable to fetch route details', e);
      }
    }

    return { seatNumber: userSeatNumber, driver, route: routeObj };
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
        {/* Debug Info - Remove after fixing */}
        {debugStudentId && (
          <div style={{ background: '#fffbe6', color: '#b36b00', padding: 8, marginBottom: 8, borderRadius: 6, fontSize: 13 }}>
            <b>Debug:</b> studentId used: <code>{debugStudentId}</code><br />
            student_bus_details query: <code style={{ wordBreak: 'break-all' }}>{JSON.stringify(debugSbdResult)}</code>
          </div>
        )}
  {/* */}
        <Card className="shadow-lg border-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
                <Bus className="w-7 h-7 text-primary-foreground" />
              </div>
              <div>
                <CardTitle className="text-2xl">
                  {assignedBusNumber ? `Bus #${assignedBusNumber}` : "Bus (not assigned)"}
                </CardTitle>
                <div className="flex items-center gap-2 text-muted-foreground mt-1">
                  <MapPin className="w-4 h-4" />
                  <span className="text-sm">{assignedStop || "No stop assigned"}</span>
                </div>
              </div>
            </div>
            <Button variant="outline" onClick={handleLogout} className="gap-2">
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </CardHeader>
        </Card>

        {/* User Info */}
        <Card className="shadow-lg border-2">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Passenger Name</p>
                <p className="text-lg font-semibold">{userName}</p>
              </div>
              {assignedStop && (
                <div>
                  <p className="text-sm text-muted-foreground">Assigned Stop</p>
                  <p className="text-lg font-semibold">{assignedStop}</p>
                </div>
              )}
              {assignedBusNumber && (
                <div>
                  <p className="text-sm text-muted-foreground">Bus Number</p>
                  <p className="text-lg font-semibold">{assignedBusNumber}</p>
                </div>
              )}
              <Badge variant="secondary" className="text-sm px-3 py-1">
                {userType === "faculty" ? "Faculty Member" : "Student"}
              </Badge>
              <div className="ml-auto">
                <p className="text-sm text-muted-foreground">Your Seat</p>
                <p className="text-2xl font-bold text-accent">{userSeatNumberState || '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Coordinator attendance uploader (visible when logged-in user is faculty and has a seat) */}
        {userType === 'faculty' && userSeatNumberState && (
          <Card className="mt-4 shadow-md">
            <CardHeader>
              <CardTitle>Submit Attendance (Coordinator)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <label className="text-sm">Date</label>
                  <input type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} className="w-full border rounded px-2 py-1" />
                </div>
                <div>
                  <label className="text-sm">Students on bus (count)</label>
                  <input type="number" min={0} value={attendanceCount as any} onChange={(e) => setAttendanceCount(e.target.value ? Number(e.target.value) : '')} className="w-full border rounded px-2 py-1" />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    className="px-4 py-2 bg-primary text-white rounded disabled:opacity-50"
                    disabled={!attendanceDate || attendanceCount === ''}
                    onClick={async () => {
                      setAttendanceStatus(null);
                      try {
                        const userJson = localStorage.getItem('user');
                        const user = userJson ? JSON.parse(userJson) : null;
                        const routeNumber = user?.route;
                        const resp = await fetch(`/routes/${routeNumber}/attendance`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ date: attendanceDate, count: Number(attendanceCount), submittedBy: user?.name || user?.email }),
                        });
                        const json = await resp.json();
                        if (json && json.success) {
                          setAttendanceStatus('Submitted');
                          setAttendanceDate('');
                          setAttendanceCount('');
                        } else {
                          setAttendanceStatus(json?.message || 'Failed');
                        }
                      } catch (e: any) {
                        setAttendanceStatus(e?.message || 'Network error');
                      }
                    }}
                  >
                    Submit
                  </button>
                  {attendanceStatus && <div className="text-sm">{attendanceStatus}</div>}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Seat Layout */}
        <Card className="shadow-lg border-2">
          <CardHeader>
            <CardTitle>Seat Layout</CardTitle>
          </CardHeader>
          <CardContent>
            {errorMessage ? (
              <div className="p-6 text-center text-destructive">{errorMessage}</div>
            ) : null}
            {/* Driver Section */}
            {/* Driver row: seat 51 (left of driver) and driver in right top corner */}
            <div className="mb-6 flex items-center gap-4">
              <div className="w-16 h-16 bg-muted rounded-lg flex flex-col items-center justify-center border-2 border-border px-2 py-1">
                <span className="text-xs font-semibold text-muted-foreground">Driver</span>
                <span className="text-sm font-medium mt-1">{driverName || '—'}</span>
              </div>
              <div className="flex-1 h-0.5 bg-border" />
            </div>

            {/* Seats Grid: 10 rows. Left: 2 seats (double), spacer, Right: 3 seats (triple) */}
            <div className="max-w-md mx-auto space-y-3">
              {Array.from({ length: 10 }).map((_, r) => {
                const base = r * 5; // 5 seats per row
                const leftSeats = seats.slice(base, base + 2);
                const rightSeats = seats.slice(base + 2, base + 5);
                return (
                  <div key={base} className="flex items-center gap-8">
                    {/* Left double seats */}
                    <div className="grid grid-cols-2 gap-3 w-[172px]">
                      {leftSeats.map((seat, i) =>
                        seat ? (
                          <button
                            key={seat.number}
                            className={`relative w-20 h-20 rounded-xl transition-all duration-200 ${getSeatColor(
                              seat.type
                            )} flex flex-col items-center justify-center ${
                              seat.type === "user" ? "text-white" : "text-gray-900"
                            } font-bold shadow-md`}
                            title={seat.occupiedBy || "Available"}
                          >
                            <span className="text-lg">{seat.number}</span>
                            {seat.occupiedBy && (
                              <span className="text-[10px] opacity-100 mt-0.5 truncate max-w-full px-1">
                                <span className={
                                  seat.occupiedGender === 'female'
                                    ? 'text-pink-600 font-semibold'
                                    : seat.occupiedGender === 'male'
                                    ? 'text-sky-700 font-semibold'
                                    : 'text-gray-800'
                                }>{seat.occupiedBy}</span>
                              </span>
                            )}
                          </button>
                        ) : (
                          <div key={`l-${r}-${i}`} className="w-20 h-20 rounded-xl bg-transparent" />
                        )
                      )}
                    </div>

                    {/* Spacer between left and right groups */}
                    <div className="w-12" />

                    {/* Right triple seats */}
                    <div className="grid grid-cols-3 gap-3 w-[264px]">
                      {rightSeats.map((seat, i) =>
                        seat ? (
                          <button
                            key={seat.number}
                            className={`relative w-20 h-20 rounded-xl transition-all duration-200 ${getSeatColor(
                              seat.type
                            )} flex flex-col items-center justify-center ${
                              seat.type === "user" ? "text-white" : "text-gray-900"
                            } font-bold shadow-md`}
                            title={seat.occupiedBy || "Available"}
                          >
                            <span className="text-lg">{seat.number}</span>
                            {seat.occupiedBy && (
                              <span className="text-[10px] opacity-100 mt-0.5 truncate max-w-full px-1">
                                <span className={
                                  seat.occupiedGender === 'female'
                                    ? 'text-pink-600 font-semibold'
                                    : seat.occupiedGender === 'male'
                                    ? 'text-sky-700 font-semibold'
                                    : 'text-gray-800'
                                }>{seat.occupiedBy}</span>
                              </span>
                            )}
                          </button>
                        ) : (
                          <div key={`r-${r}-${i}`} className="w-20 h-20 rounded-xl bg-transparent" />
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Extra bottom row: last 6 seats (boys) 52..57 */}
            <div className="mt-6 max-w-md mx-auto">
              <div className="grid grid-cols-6 gap-3 justify-center">
                {seats
                  .filter((s) => s.number >= 52 && s.number <= 57)
                  .map((seat) => (
                    <button
                      key={seat.number}
                      className={`w-20 h-20 rounded-xl transition-all duration-200 ${getSeatColor(
                        seat.type
                      )} flex flex-col items-center justify-center ${
                        seat.type === 'user' ? 'text-white' : 'text-gray-900'
                      } font-bold shadow-md`}
                      title={seat.occupiedBy || 'Available'}
                    >
                      <span className="text-lg">{seat.number}</span>
                      {seat.occupiedBy && (
                        <span className="text-[10px] opacity-100 mt-0.5 truncate max-w-full px-1">
                          <span className={
                            seat.occupiedGender === 'female'
                              ? 'text-pink-600 font-semibold'
                              : seat.occupiedGender === 'male'
                              ? 'text-sky-700 font-semibold'
                              : 'text-gray-800'
                          }>{seat.occupiedBy}</span>
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            </div>

            {/* Legend */}
            <div className="mt-8 pt-6 border-t border-border">
              <p className="text-sm font-semibold mb-3">Legend</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-seat-faculty/60" />
                  <span className="text-sm">Faculty</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-seat-girl/60" />
                  <span className="text-sm">Girls</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-seat-boy/60" />
                  <span className="text-sm">Boys</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-seat-user/90 ring-4 ring-accent/50" />
                  <span className="text-sm">Your Seat</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-seat-available/50" />
                  <span className="text-sm">Available</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default Seats;
