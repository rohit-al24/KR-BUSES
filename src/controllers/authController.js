
import supabase from '../lib/supabaseClient.js';
import { students, staff } from '../data/dummyData.js';

// Find user by email in users table
async function findUserByEmail(email) {
  // If Supabase is configured, query the users table
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .ilike('email', String(email).toLowerCase())
        .limit(1);
      if (error) {
        console.warn('Supabase query error', error.message || error);
      }
      if (data && data.length) return data[0];
    } catch (e) {
      console.warn('Supabase lookup failed, e:', e && e.message ? e.message : e);
    }
    return null;
  }

  // Fallback: use in-memory dummy data (students/staff)
  try {
    const lower = String(email).toLowerCase();
    const fromStudents = students.find(u => u.email && u.email.toLowerCase() === lower);
    if (fromStudents) return fromStudents;
    const fromStaff = staff.find(u => u.email && u.email.toLowerCase() === lower);
    if (fromStaff) return fromStaff;
  } catch (e) {
    console.warn('In-memory lookup failed', e && e.message ? e.message : e);
  }
  return null;
}


export async function login(req, res) {
  const { email, password, role } = req.body || {};
  if (!email || !password || !role) {
    return res.status(400).json({ success: false, message: 'email, password and role are required' });
  }

  // Accept only valid enum roles
  const allowedRoles = ['student', 'staff', 'admin', 'coordinator'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ success: false, message: `role must be one of: ${allowedRoles.join(', ')}` });
  }

  try {
    // Determine backend role mapping: frontend 'coordinator' -> backend 'staff'
    const backendRole = role === 'student' ? 'student' : (role === 'admin' ? 'admin' : 'staff');

    // 1. If Supabase is configured, authenticate with Supabase Auth
    if (supabase && supabase.auth && typeof supabase.auth.signInWithPassword === 'function') {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError || !authData || !authData.user) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }
    }

    // 2. Find user in users table or in-memory
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found in users table' });
    }

    // If Supabase is not configured, perform a fallback password check using DOB in dummy data
    if (!supabase) {
      // in-memory users in dummyData use 'dob' as the simple password in dev
      if (!user.dob || String(user.dob) !== String(password)) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }
    }

    // 3. Check role matches (map frontend coordinator -> backend staff)
    if (user.role !== backendRole) {
      return res.status(403).json({ success: false, message: `User does not have role: ${role}` });
    }

    // 4. If student, check paid
    if (backendRole === 'student' && user.paid !== true) {
      return res.status(403).json({ success: false, message: 'Pay the bus fees to access seat' });
    }

    // 5. Return user info (omit password_hash if present)
    const { password_hash, ...safeUser } = user;
    return res.json({ success: true, user: safeUser });
  } catch (e) {
    console.error('Login handler failed', e && e.message ? e.message : e);
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
}
