import { buses, students } from '../src/data/dummyData.js';

function pickStudentForRoute(route) {
  const s = students.find((st) => st.route === route.number && st.seatNumber != null);
  if (s) return s;
  // fallback: any student on route
  return students.find((st) => st.route === route.number) || null;
}

for (const r of buses) {
  const s = pickStudentForRoute(r);
  if (s) {
    console.log(`Route ${r.number}: ${s.name} — email: ${s.email} — dob: ${s.dob} — seat: ${s.seatNumber ?? 'unassigned'}`);
  } else {
    console.log(`Route ${r.number}: (no students)`);
  }
}
