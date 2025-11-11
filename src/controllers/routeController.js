import { routes, students, staff } from '../data/dummyData.js';
import { v4 as uuidv4 } from 'uuid';

export function listRoutes(req, res) {
  res.json({ success: true, routes });
}

export function getRoute(req, res) {
  const num = Number(req.params.number);
  const route = routes.find(r => r.number === num);
  if (!route) return res.status(404).json({ success: false, message: 'Route not found' });
  // include students assigned to this route
  const assigned = students.filter(s => s.route === num);
  const staffAssigned = staff.filter(f => f.route === num);
  res.json({ success: true, route: { ...route, students: assigned, staff: staffAssigned } });
}

export function adminOverview(req, res) {
  try {
    const overview = routes.map((r) => {
      const assigned = students.filter((s) => s.route === r.number);
      const staffAssigned = staff.filter((f) => f.route === r.number);
      const boys = assigned.filter((s) => s.gender === 'male').length;
      const girls = assigned.filter((s) => s.gender === 'female').length;
      return {
        number: r.number,
        busNumber: r.busNumber,
        driver: r.driver,
        capacity: r.capacity,
        studentsTotal: assigned.length,
        boys,
        girls,
        staff: staffAssigned.length,
      };
    });
    res.json({ success: true, overview });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to build admin overview' });
  }
}

export function submitAttendance(req, res) {
  // debug/log incoming attendance submissions
  // eslint-disable-next-line no-console
  console.log(`submitAttendance called: ${req.method} ${req.originalUrl} body=`, req.body);
  const num = Number(req.params.number);
  const { date, count, submittedBy } = req.body || {};
  if (!date || typeof count !== 'number' || !submittedBy) {
    return res.status(400).json({ success: false, message: 'date, count (number) and submittedBy are required' });
  }
  const route = routes.find(r => r.number === num);
  if (!route) return res.status(404).json({ success: false, message: 'Route not found' });
  route.attendance = route.attendance || [];
  route.attendance.push({ date, count, submittedBy, submittedAt: new Date().toISOString() });
  res.json({ success: true, message: 'Attendance recorded' });
}

export function getAttendance(req, res) {
  const num = Number(req.params.number);
  const route = routes.find(r => r.number === num);
  if (!route) return res.status(404).json({ success: false, message: 'Route not found' });
  res.json({ success: true, attendance: route.attendance || [] });
}

// Create an attendance request for a route: create per-student pending tokens
export function createAttendanceRequest(req, res) {
  try {
    const num = Number(req.params.number);
    const route = routes.find(r => r.number === num);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found' });

    // ensure arrays exist
    route.attendanceRequests = route.attendanceRequests || [];

    const assigned = students.filter(s => s.route === num);
    const now = new Date();
    const dateKey = now.toISOString().slice(0,10);

    // create a new request batch
    const requestBatch = {
      id: uuidv4(),
      date: dateKey,
      createdAt: now.toISOString(),
      sent: true,
      // optional short PIN shown physically on the bus to ensure presence
      pin: null,
      pinExpiresAt: null,
      responses: {}, // studentId -> { status: 'pending'|'present'|'absent', respondedAt }
    };

    assigned.forEach((s) => {
      requestBatch.responses[s.id] = { status: 'pending', respondedAt: null };
    });

  // generate a short 4-digit PIN valid for 10 minutes
  const generatedPin = String(Math.floor(1000 + Math.random() * 9000));
  const pinExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  requestBatch.pin = generatedPin;
  requestBatch.pinExpiresAt = pinExpiry;

    route.attendanceRequests.push(requestBatch);

    // For real-world: here we'd dispatch SMS/push notifications containing a link or token.
    // For this prototype we log the request and return the batch so the UI can poll.
    // eslint-disable-next-line no-console
    console.log(`Attendance request created for route ${num}`, requestBatch.id, 'pin=', requestBatch.pin);

    // Return the created request including the PIN so the coordinator (or driver) can display it.
  const { pin, pinExpiresAt } = requestBatch;
  return res.json({ success: true, request: { id: requestBatch.id, date: requestBatch.date, createdAt: requestBatch.createdAt, pin, pinExpiresAt } });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('createAttendanceRequest failed', e);
    return res.status(500).json({ success: false, message: 'Failed to create attendance request' });
  }
}

// Student responds to attendance request: body { response: 'yes'|'no' }
export function studentRespond(req, res) {
  try {
    const num = Number(req.params.number);
    const id = req.params.id;
    const { response, requestId, pin } = req.body || {};
    if (!response || (response !== 'yes' && response !== 'no')) return res.status(400).json({ success: false, message: 'response must be "yes" or "no"' });

    const route = routes.find(r => r.number === num);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found' });

    const student = students.find(s => s.id === id && s.route === num);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found on this route' });

    route.attendanceRequests = route.attendanceRequests || [];
    // if requestId provided, find that request; otherwise use latest
    let target = null;
    if (requestId) {
      target = route.attendanceRequests.find(r => r.id === requestId);
      if (!target) return res.status(404).json({ success: false, message: 'Attendance request not found' });
    } else {
      target = route.attendanceRequests[route.attendanceRequests.length - 1];
    }
    if (!target) return res.status(400).json({ success: false, message: 'No active attendance request' });

  // If request already finalized, reject further responses
  if (target.finalized) return res.status(400).json({ success: false, message: 'Attendance request has been finalized' });

    // If the request requires a pin, validate it
    if (target.pin) {
      if (!pin) return res.status(403).json({ success: false, message: 'Pin required for this attendance request' });
      // check expiry
      const now = new Date();
      const expires = target.pinExpiresAt ? new Date(target.pinExpiresAt) : null;
      if (expires && now > expires) return res.status(403).json({ success: false, message: 'Pin has expired' });
      if (String(pin) !== String(target.pin)) return res.status(403).json({ success: false, message: 'Invalid pin' });
    }

    const now = new Date().toISOString();
    target.responses[id] = target.responses[id] || { status: 'pending', respondedAt: null };
    target.responses[id].status = response === 'yes' ? 'present' : 'absent';
    target.responses[id].respondedAt = now;

    // Update route.attendance summary (not final count until coordinator submits)
    route.lastAttendanceSummary = route.lastAttendanceSummary || {};
    route.lastAttendanceSummary[target.id] = route.lastAttendanceSummary[target.id] || { present: 0, absent: 0 };
    // recompute counts
    const respValues = Object.values(target.responses);
    route.lastAttendanceSummary[target.id].present = respValues.filter(r => r.status === 'present').length;
    route.lastAttendanceSummary[target.id].absent = respValues.filter(r => r.status === 'absent').length;

    // For prototype: notify coordinator/admin via in-memory notifications array
    route.notifications = route.notifications || [];
    route.notifications.push({ type: 'attendance-response', studentId: id, status: target.responses[id].status, at: now });

    // eslint-disable-next-line no-console
    console.log(`Student ${student.name} responded ${response} for route ${num} (request ${target.id})`);
    // Log the updated counts and a small snapshot of responses for debugging
    try {
      const counts = route.lastAttendanceSummary[target.id] || { present: 0, absent: 0 };
      console.log(`Attendance request ${target.id} counts -> present=${counts.present} absent=${counts.absent}`);
      // print a terse map of id->status for visibility (not full object to avoid huge logs)
      const terse = Object.entries(target.responses).slice(0,50).map(([k,v]) => `${k.substring(0,8)}:${v.status}`);
      console.log('Responses snapshot:', terse.join(', '));
    } catch (err) {
      // ignore logging errors
    }

    return res.json({ success: true, status: target.responses[id].status });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('studentRespond failed', e);
    return res.status(500).json({ success: false, message: 'Failed to record response' });
  }
}

// Get latest attendance request status for coordinator view
export function getLatestAttendanceRequest(req, res) {
  const num = Number(req.params.number);
  const route = routes.find(r => r.number === num);
  if (!route) return res.status(404).json({ success: false, message: 'Route not found' });
  const latest = (route.attendanceRequests || [])[route.attendanceRequests.length - 1];
  if (!latest) return res.json({ success: true, request: null });

  // build student list with statuses
  const assigned = students.filter(s => s.route === num).map(s => ({ id: s.id, name: s.name, seatNumber: s.seatNumber || null, status: latest.responses[s.id]?.status || 'pending' }));
  // Do NOT return the actual PIN here (public endpoint). Instead, indicate if a PIN is required and its expiry so clients can prompt the user to enter it.
  const pinRequired = !!latest.pin;
  const pinExpiresAt = latest.pinExpiresAt || null;
  // include finalized flag so clients can know when a request was closed
  const finalized = !!latest.finalized;
  const finalizedAt = latest.finalizedAt || null;
  return res.json({ success: true, request: { id: latest.id, date: latest.date, createdAt: latest.createdAt, pinRequired, pinExpiresAt, finalized, finalizedAt, students: assigned } });
}

// Dev/debug: return the full attendance request (including pin and full responses)
export function getAttendanceRequestFull(req, res) {
  try {
    const num = Number(req.params.number);
    const id = req.params.id;
    const route = routes.find(r => r.number === num);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found' });
    route.attendanceRequests = route.attendanceRequests || [];
    const request = route.attendanceRequests.find((r) => r.id === id);
    if (!request) return res.status(404).json({ success: false, message: 'Attendance request not found' });
    return res.json({ success: true, request });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('getAttendanceRequestFull failed', e);
    return res.status(500).json({ success: false, message: 'Failed to fetch attendance request' });
  }
}

// Finalize an attendance request: compute present count and add to route.attendance
export function finalizeAttendanceRequest(req, res) {
  try {
    const num = Number(req.params.number);
    const id = req.params.id;
    const route = routes.find(r => r.number === num);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found' });
    route.attendanceRequests = route.attendanceRequests || [];
    const request = route.attendanceRequests.find((r) => r.id === id);
    if (!request) return res.status(404).json({ success: false, message: 'Attendance request not found' });

    // compute present count
    const respValues = Object.values(request.responses || {});
    const presentCount = respValues.filter(r => r.status === 'present').length;

    route.attendance = route.attendance || [];
    const now = new Date().toISOString();
    const attendanceRecord = {
      date: request.date || now.slice(0,10),
      count: presentCount,
      submittedBy: req.body?.submittedBy || 'coordinator',
      submittedAt: now,
      requestId: request.id,
    };
    route.attendance.push(attendanceRecord);

    // mark request finalized
    request.finalized = true;
    request.finalizedAt = now;

    // eslint-disable-next-line no-console
    console.log(`Finalized attendance request ${request.id} for route ${num} -> present=${presentCount}`);

    return res.json({ success: true, attendance: attendanceRecord });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('finalizeAttendanceRequest failed', e);
    return res.status(500).json({ success: false, message: 'Failed to finalize attendance request' });
  }
}

export function confirmStudentFee(req, res) {
  try {
    const num = Number(req.params.number);
    const id = req.params.id;
    const route = routes.find(r => r.number === num);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found' });

    const student = students.find((s) => s && s.id === id && s.route === num);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found on this route' });

    student.paid = true;

    // return updated student (omit dob)
    const { dob, ...safe } = student;
    return res.json({ success: true, student: safe });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to confirm fee' });
  }
}

// Dev/Coordinator action: mark a student's fee status as unpaid
export function markStudentUnpaid(req, res) {
  try {
    const num = Number(req.params.number);
    const id = req.params.id;
    const route = routes.find(r => r.number === num);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found' });

    const student = students.find((s) => s && s.id === id && s.route === num);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found on this route' });

    student.paid = false;

    const { dob, ...safe } = student;
    return res.json({ success: true, student: safe });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to mark unpaid' });
  }
}

// Dev helper: return one student and the staff credentials for a route (email + dob)
// WARNING: dev-only; returns sensitive test credentials. Do not enable in production.
export function getTestCredentials(req, res) {
  try {
    const num = Number(req.params.number);
    const route = routes.find(r => r.number === num);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found' });

    // find a student assigned to this route
    const assigned = students.filter(s => s.route === num);
    const student = assigned[0] || null;

    // find a staff/coordinator for this route
    const staffAssigned = staff.filter(f => f.route === num);
    const faculty = staffAssigned[0] || null;

    // return email + dob for each (dob is used as password in this dev app)
    const studentCred = student ? { email: student.email, dob: student.dob, name: student.name, id: student.id } : null;
    const staffCred = faculty ? { email: faculty.email, dob: faculty.dob, name: faculty.name, id: faculty.id, role: faculty.role } : null;

    return res.json({ success: true, student: studentCred, staff: staffCred });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('getTestCredentials failed', e);
    return res.status(500).json({ success: false, message: 'Failed to fetch test credentials' });
  }
}
