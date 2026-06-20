/* ============================================
   MSS SCHOOL - Supabase Client & Data Layer
   ============================================ */

'use strict';

// ─── SUPABASE CONFIG ─────────────────────────────────────────────────────────
// Credentials are injected at build time via Vercel env vars → build.sh → js/config.js
// window.MSS_CONFIG is defined in js/config.js (gitignored, generated at build)
const _cfg = (typeof window !== 'undefined' && window.MSS_CONFIG) || {};
const SUPABASE_URL = _cfg.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = _cfg.SUPABASE_ANON_KEY || '';

// ─── SUPABASE CLIENT ─────────────────────────────────────────────────────────
let _supabaseClient = null;

function getSupabase() {
  if (_supabaseClient) return _supabaseClient;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase not configured – check Vercel env vars.');
  if (typeof window !== 'undefined' && window.supabase) {
    _supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return _supabaseClient;
  }
  throw new Error('Supabase SDK not loaded');
}

function isSupabaseConfigured() { return !!(SUPABASE_URL && SUPABASE_ANON_KEY); }
const SUPABASE_CONFIGURED = isSupabaseConfigured();


// ─── SESSION CACHE ────────────────────────────────────────────────────────────
// School data is cached in sessionStorage (cleared when browser closes).
// localStorage is only used for UI preferences (e.g. active academic year).
// On every new browser session, fresh data is pulled from Supabase.
const LOCAL = {
  get(key) {
    try { return JSON.parse(sessionStorage.getItem('mss_' + key)) || null; }
    catch { return null; }
  },
  set(key, value) {
    try { sessionStorage.setItem('mss_' + key, JSON.stringify(value)); }
    catch (e) { console.warn('Session cache write failed:', e); }
  },
  remove(key) {
    sessionStorage.removeItem('mss_' + key);
  }
};

function getActiveAcademicYear() {
  const customYear = localStorage.getItem('mss_activeAcademicYear');
  if (customYear) return customYear;

  const y = new Date().getFullYear();
  const m = new Date().getMonth() + 1;
  if (m >= 6) return `${y}-${(y + 1).toString().substr(2)}`;
  return `${y - 1}-${y.toString().substr(2)}`;
}

// Background sync: writes session cache changes to Supabase asynchronously
// Background sync error helper
function handleSyncError(key, err) {
  console.error(`Background sync for '${key}' failed:`, err);
  if (typeof showToast === 'function') {
    showToast(`Syncing ${key} to Supabase failed! Verify your database tables & RLS policies.`, 'danger', 5000);
  }
}

// Background sync: writes session cache changes to Supabase asynchronously
function triggerBackgroundSync(key, value) {
  if (!SUPABASE_CONFIGURED) return Promise.resolve();

  let client;
  try {
    client = getSupabase();
  } catch (e) {
    console.warn("Supabase not fully loaded/configured for background sync:", e);
    return Promise.resolve();
  }

  const activeYear = getActiveAcademicYear();

  if (key === 'students') {
    return (async () => {
      try {
        const { data: remoteStudents, error: fetchErr } = await client.from('students').select('id');
        if (fetchErr) throw fetchErr;
        const remoteIds = (remoteStudents || []).map(r => r.id);
        const localIds = value.map(s => s.id);

        // Deletions
        const toDelete = remoteIds.filter(id => !localIds.includes(id));
        if (toDelete.length > 0) {
          await client.from('students').delete().in('id', toDelete);
        }

        // Bulk Upsertions
        const rows = value.map(s => ({
          id: s.id,
          roll_no: s.rollNo || '',
          name: s.name || '',
          dob: s.dob || null,
          class_id: s.classId === 'graduated' ? null : (s.classId || null),
          type: s.type || 'dayscholar',
          bus_id: s.busId || null,
          phone: s.phone || null,
          parent_name: s.parentName || null,
          academic_year: s.academicYear || activeYear
        }));
        if (rows.length > 0) {
          const { error: upsertErr } = await client.from('students').upsert(rows);
          if (upsertErr) throw upsertErr;
        }
      } catch (err) {
        handleSyncError('students', err);
        throw err;
      }
    })();
  }

  else if (key === 'teachers') {
    return (async () => {
      try {
        const { data: remoteTeachers, error: fetchErr } = await client.from('teachers').select('id');
        if (fetchErr) throw fetchErr;
        const remoteIds = (remoteTeachers || []).map(r => r.id);
        const localIds = value.map(t => t.id);

        // Deletions
        const toDelete = remoteIds.filter(id => !localIds.includes(id));
        if (toDelete.length > 0) {
          await client.from('teachers').delete().in('id', toDelete);
        }

        // Bulk Upsertions
        const rows = value.map(t => ({
          id: t.id,
          name: t.name || '',
          username: t.username || '',
          password: t.password || '',
          class_id: Array.isArray(t.classId) ? JSON.stringify(t.classId) : (t.classId || null),
          phone: t.phone || null,
          email: t.email || null
        }));
        if (rows.length > 0) {
          const { error: upsertErr } = await client.from('teachers').upsert(rows);
          if (upsertErr) throw upsertErr;
        }
      } catch (err) {
        handleSyncError('teachers', err);
        throw err;
      }
    })();
  }

  else if (key === 'buses') {
    return (async () => {
      try {
        const { data: remoteBuses, error: fetchErr } = await client.from('buses').select('id');
        if (fetchErr) throw fetchErr;
        const remoteIds = (remoteBuses || []).map(r => r.id);
        const localIds = value.map(b => b.id);

        // Deletions
        const toDelete = remoteIds.filter(id => !localIds.includes(id));
        if (toDelete.length > 0) {
          await client.from('buses').delete().in('id', toDelete);
        }

        // Bulk Upsertions
        const rows = value.map(b => ({
          id: b.id,
          number: b.number || '',
          route: b.route || '',
          driver: b.driver || null,
          phone: b.phone || null,
          capacity: Number(b.capacity) || 40
        }));
        if (rows.length > 0) {
          const { error: upsertErr } = await client.from('buses').upsert(rows);
          if (upsertErr) throw upsertErr;
        }
      } catch (err) {
        handleSyncError('buses', err);
        throw err;
      }
    })();
  }

  else if (key === 'classes') {
    return (async () => {
      try {
        const { data: remoteClasses, error: fetchErr } = await client.from('classes').select('id');
        if (fetchErr) throw fetchErr;
        const remoteIds = (remoteClasses || []).map(r => r.id);
        const localIds = value.map(c => c.id);

        // Deletions
        const toDelete = remoteIds.filter(id => !localIds.includes(id));
        if (toDelete.length > 0) {
          await client.from('classes').delete().in('id', toDelete);
        }

        // Bulk Upsertions
        const rows = value.map(c => ({
          id: c.id,
          name: c.name || '',
          section: c.section || '',
          grade: Number(c.grade) || 0
        }));
        if (rows.length > 0) {
          const { error: upsertErr } = await client.from('classes').upsert(rows);
          if (upsertErr) throw upsertErr;
        }
      } catch (err) {
        handleSyncError('classes', err);
        throw err;
      }
    })();
  }

  else if (key === 'attendanceLogs') {
    return (async () => {
      try {
        const rows = value.map(l => ({
          student_id: l.studentId,
          date: l.date,
          type: l.type,
          present: l.present
        }));
        if (rows.length > 0) {
          const { error: upsertErr } = await client.from('attendance_logs').upsert(rows, { onConflict: 'student_id,date,type' });
          if (upsertErr) throw upsertErr;
        }
      } catch (err) {
        handleSyncError('attendance logs', err);
        throw err;
      }
    })();
  }

  else if (key === 'marks') {
    return (async () => {
      try {
        const records = [];
        for (const studentId in value) {
          for (const subject in value[studentId]) {
            for (const exam in value[studentId][subject]) {
              records.push({
                student_id: studentId,
                subject: subject,
                exam: exam,
                marks_obtained: Number(value[studentId][subject][exam]) || 0
              });
            }
          }
        }
        if (records.length > 0) {
          const { error: upsertErr } = await client.from('marks').upsert(records, { onConflict: 'student_id,subject,exam' });
          if (upsertErr) throw upsertErr;
        }
      } catch (err) {
        handleSyncError('marks', err);
        throw err;
      }
    })();
  }

  else if (key === 'admissions') {
    // Bypassed: admission_applications table is removed from Supabase as it is connected to a Google Form
    return Promise.resolve();
  }
  return Promise.resolve();
}

// ─── UNIFIED DB LAYER ────────────────────────────────────────────────────
/**
 * DB – Unified data layer.
 * Reads from sessionStorage cache (fast, in-session only).
 * Writes go to sessionStorage cache + Supabase simultaneously.
 * Supabase is always the source of truth.
 */
var DB = {
  get(key) { return LOCAL.get(key); },
  set(key, value) {
    LOCAL.set(key, value);
    return triggerBackgroundSync(key, value);
  },
  remove(key) {
    LOCAL.remove(key);
    return triggerBackgroundSync(key, []);
  },

  getLocal: (key) => LOCAL.get(key),
  setLocal: (key, value) => { LOCAL.set(key, value); return triggerBackgroundSync(key, value); },
  removeLocal: (key) => { LOCAL.remove(key); return triggerBackgroundSync(key, []); },

  // ── Async Supabase methods ────────────────────────────────────────────
  async getStudents() {
    if (!SUPABASE_CONFIGURED) return LOCAL.get('students') || [];
    const { data, error } = await getSupabase().from('students').select('*').order('roll_no');
    if (error) { console.error('Supabase getStudents:', error); return LOCAL.get('students') || []; }
    return data;
  },

  async addStudent(student) {
    if (!SUPABASE_CONFIGURED) {
      const list = LOCAL.get('students') || [];
      list.push(student);
      LOCAL.set('students', list);
      return { data: student, error: null };
    }
    return await getSupabase().from('students').insert([student]).select().single();
  },

  async updateStudent(id, updates) {
    if (!SUPABASE_CONFIGURED) {
      const list = LOCAL.get('students') || [];
      const idx = list.findIndex(s => s.id === id);
      if (idx !== -1) { list[idx] = { ...list[idx], ...updates }; LOCAL.set('students', list); }
      return { data: list[idx], error: null };
    }
    return await getSupabase().from('students').update(updates).eq('id', id).select().single();
  },

  async deleteStudent(id) {
    if (!SUPABASE_CONFIGURED) {
      LOCAL.set('students', (LOCAL.get('students') || []).filter(s => s.id !== id));
      return { error: null };
    }
    return await getSupabase().from('students').delete().eq('id', id);
  },

  async getTeachers() {
    if (!SUPABASE_CONFIGURED) return LOCAL.get('teachers') || [];
    const { data, error } = await getSupabase().from('teachers').select('*');
    if (error) { console.error('Supabase getTeachers:', error); return LOCAL.get('teachers') || []; }
    return data;
  },

  async addTeacher(teacher) {
    if (!SUPABASE_CONFIGURED) {
      const list = LOCAL.get('teachers') || [];
      list.push(teacher);
      LOCAL.set('teachers', list);
      return { data: teacher, error: null };
    }
    return await getSupabase().from('teachers').insert([teacher]).select().single();
  },

  async deleteTeacher(id) {
    if (!SUPABASE_CONFIGURED) {
      LOCAL.set('teachers', (LOCAL.get('teachers') || []).filter(t => t.id !== id));
      return { error: null };
    }
    return await getSupabase().from('teachers').delete().eq('id', id);
  },

  async getBuses() {
    if (!SUPABASE_CONFIGURED) return LOCAL.get('buses') || [];
    const { data, error } = await getSupabase().from('buses').select('*');
    if (error) { console.error('Supabase getBuses:', error); return LOCAL.get('buses') || []; }
    return data;
  },

  async addBus(bus) {
    if (!SUPABASE_CONFIGURED) {
      const list = LOCAL.get('buses') || [];
      list.push(bus);
      LOCAL.set('buses', list);
      return { data: bus, error: null };
    }
    return await getSupabase().from('buses').insert([bus]).select().single();
  },

  async deleteBus(id) {
    if (!SUPABASE_CONFIGURED) {
      LOCAL.set('buses', (LOCAL.get('buses') || []).filter(b => b.id !== id));
      return { error: null };
    }
    return await getSupabase().from('buses').delete().eq('id', id);
  },

  async getClasses() {
    if (!SUPABASE_CONFIGURED) return LOCAL.get('classes') || [];
    const { data, error } = await getSupabase().from('classes').select('*').order('grade');
    if (error) { console.error('Supabase getClasses:', error); return LOCAL.get('classes') || []; }
    return data;
  },

  // Attendance
  async getAttendanceLogs(date, type) {
    if (!SUPABASE_CONFIGURED) {
      const logs = LOCAL.get('attendanceLogs') || [];
      return logs.filter(l => l.date === date && l.type === type);
    }
    const q = getSupabase().from('attendance_logs').select('*').eq('date', date);
    if (type) { const { data, error } = await q.eq('type', type); if (error) return []; return data; }
    const { data, error } = await q; if (error) return []; return data;
  },

  async upsertAttendance(record) {
    if (!SUPABASE_CONFIGURED) {
      const logs = LOCAL.get('attendanceLogs') || [];
      const idx = logs.findIndex(l => l.studentId === record.studentId && l.date === record.date && l.type === record.type);
      if (idx !== -1) logs[idx] = record; else logs.push(record);
      LOCAL.set('attendanceLogs', logs);
      return { data: record, error: null };
    }
    return await getSupabase().from('attendance_logs').upsert([record], { onConflict: 'student_id,date,type' });
  },

  // Marks
  async getMarks(studentId) {
    if (!SUPABASE_CONFIGURED) {
      const marks = LOCAL.get('marks') || {};
      return marks[studentId] || {};
    }
    const { data, error } = await getSupabase().from('marks').select('*').eq('student_id', studentId);
    if (error) return {};
    // Transform flat rows → subject-keyed object
    return data.reduce((acc, row) => {
      if (!acc[row.subject]) acc[row.subject] = {};
      acc[row.subject][row.exam] = row.marks_obtained;
      return acc;
    }, {});
  },

  async upsertMark(record) {
    if (!SUPABASE_CONFIGURED) {
      const allMarks = LOCAL.get('marks') || {};
      if (!allMarks[record.studentId]) allMarks[record.studentId] = {};
      if (!allMarks[record.studentId][record.subject]) allMarks[record.studentId][record.subject] = {};
      allMarks[record.studentId][record.subject][record.exam] = record.marksObtained;
      LOCAL.set('marks', allMarks);
      return { error: null };
    }
    return await getSupabase().from('marks').upsert([{
      student_id: record.studentId, subject: record.subject,
      exam: record.exam, marks_obtained: record.marksObtained
    }], { onConflict: 'student_id,subject,exam' });
  },





  // Admission Applications
  async submitAdmission(formData) {
    // Save locally in sessionStorage cache (bypassed from Supabase since table is removed / Google Form managed)
    const apps = LOCAL.get('admissions') || [];
    apps.push({ ...formData, id: genId('app'), submittedAt: new Date().toISOString(), status: 'pending' });
    LOCAL.set('admissions', apps);
    return { data: formData, error: null };
  },

  async getAdmissions() {
    // Retrieve only from local sessionStorage cache
    return LOCAL.get('admissions') || [];
  },

  // ── Synchronization Methods ───────────────────────────────────────────

  async pullAllFromSupabase() {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase is not configured');
    }
    const mapKeys = (obj, mapping) => {
      const res = {};
      for (const k in obj) {
        const newKey = mapping[k] || k;
        res[newKey] = obj[k];
      }
      return res;
    };
    try {
      const client = getSupabase();

      // 1. Classes
      const { data: classes, error: errClasses } = await client.from('classes').select('*');
      if (errClasses) throw errClasses;
      if (classes) {
        LOCAL.set('classes', classes);
      }

      // 2. Students
      const { data: students, error: errStudents } = await client.from('students').select('*');
      if (errStudents) throw errStudents;
      if (students) {
        const mappedStudents = students.map(s => mapKeys(s, {
          class_id: 'classId',
          roll_no: 'rollNo',
          bus_id: 'busId',
          parent_name: 'parentName',
          academic_year: 'academicYear'
        }));
        LOCAL.set('students', mappedStudents);
      }

      // 3. Teachers
      const { data: teachers, error: errTeachers } = await client.from('teachers').select('*');
      if (errTeachers) throw errTeachers;
      if (teachers) {
        const mappedTeachers = teachers.map(t => {
          let mapped = mapKeys(t, { class_id: 'classId' });
          if (typeof mapped.classId === 'string' && mapped.classId.startsWith('[')) {
            try {
              mapped.classId = JSON.parse(mapped.classId);
            } catch (e) {
              console.warn("Failed to parse teacher classId JSON string:", mapped.classId);
            }
          }
          return mapped;
        });
        LOCAL.set('teachers', mappedTeachers);
      }

      // 4. Buses
      const { data: buses, error: errBuses } = await client.from('buses').select('*');
      if (errBuses) throw errBuses;
      if (buses) {
        LOCAL.set('buses', buses);
      }

      // 5. Attendance logs
      const { data: logs, error: errLogs } = await client.from('attendance_logs').select('*');
      if (errLogs) throw errLogs;
      if (logs) {
        const mappedLogs = logs.map(l => mapKeys(l, {
          student_id: 'studentId'
        }));
        LOCAL.set('attendanceLogs', mappedLogs);
      }

      // 6. Marks
      const { data: marks, error: errMarks } = await client.from('marks').select('*');
      if (errMarks) throw errMarks;
      if (marks) {
        const marksObj = {};
        marks.forEach(m => {
          const sId = m.student_id;
          if (!marksObj[sId]) marksObj[sId] = {};
          if (!marksObj[sId][m.subject]) marksObj[sId][m.subject] = {};
          marksObj[sId][m.subject][m.exam] = m.marks_obtained;
        });
        LOCAL.set('marks', marksObj);
      }

      // 7. Admissions - Bypassed from Supabase since table is removed / Google Form managed
      LOCAL.set('admissions', LOCAL.get('admissions') || []);

      window.dispatchEvent(new Event('mss-db-sync'));
    } catch (error) {
      console.error('Supabase pullAllFromSupabase failed:', error);
      if (typeof showToast === 'function') {
        showToast('Failed to load data from Supabase. Verify database tables and RLS permissions.', 'danger', 5000);
      }
      throw error;
    }
  }
};

window.DB = DB;

// Pull fresh data from Supabase on every new browser session.
// sessionStorage is empty at session start so this always runs.
if (!sessionStorage.getItem('mss_session_pulled')) {
  setTimeout(() => {
    DB.pullAllFromSupabase()
      .then(() => { sessionStorage.setItem('mss_session_pulled', '1'); })
      .catch(err => {
        console.warn('Initial Supabase pull failed:', err);
      });
  }, 200);
}

// ─── SQL SCHEMA (for reference / migration) ──────────────────────────────
/*
-- Run this in Supabase SQL Editor to create tables:

CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  section TEXT,
  grade INTEGER
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  roll_no TEXT NOT NULL,
  name TEXT NOT NULL,
  dob DATE,
  class_id TEXT REFERENCES classes(id),
  type TEXT DEFAULT 'dayscholar',
  bus_id TEXT,
  phone TEXT,
  parent_name TEXT,
  academic_year TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  class_id TEXT REFERENCES classes(id),
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS buses (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  route TEXT,
  driver TEXT,
  phone TEXT,
  capacity INTEGER DEFAULT 40,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_logs (
  id BIGSERIAL PRIMARY KEY,
  student_id TEXT REFERENCES students(id),
  date DATE NOT NULL,
  type TEXT NOT NULL,    -- 'class' | 'bus'
  present BOOLEAN DEFAULT false,
  recorded_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, date, type)
);

CREATE TABLE IF NOT EXISTS marks (
  id BIGSERIAL PRIMARY KEY,
  student_id TEXT REFERENCES students(id),
  subject TEXT NOT NULL,
  exam TEXT NOT NULL,    -- 'exam1' | 'exam2' | 'exam3'
  marks_obtained INTEGER,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, subject, exam)
);

CREATE TABLE IF NOT EXISTS admission_applications (
  id BIGSERIAL PRIMARY KEY,
  student_name TEXT,
  dob DATE,
  gender TEXT,
  applying_class TEXT,
  nationality TEXT,
  religion TEXT,
  father_name TEXT,
  mother_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  father_occupation TEXT,
  annual_income TEXT,
  prev_school TEXT,
  last_class TEXT,
  transport TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  submitted_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE buses ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_applications ENABLE ROW LEVEL SECURITY;

-- 🚨 IMPORTANT: Row Level Security (RLS) Policies
-- The following policies grant full access (SELECT, INSERT, UPDATE, DELETE) using the anon key.
-- Copy and run these in the Supabase SQL editor to ensure the frontend can read and write data.

-- 1. Classes Policies
CREATE POLICY "Classes select" ON classes FOR SELECT USING (true);
CREATE POLICY "Classes insert" ON classes FOR INSERT WITH CHECK (true);
CREATE POLICY "Classes update" ON classes FOR UPDATE USING (true);
CREATE POLICY "Classes delete" ON classes FOR DELETE USING (true);

-- 2. Students Policies
CREATE POLICY "Students select" ON students FOR SELECT USING (true);
CREATE POLICY "Students insert" ON students FOR INSERT WITH CHECK (true);
CREATE POLICY "Students update" ON students FOR UPDATE USING (true);
CREATE POLICY "Students delete" ON students FOR DELETE USING (true);

-- 3. Teachers Policies
CREATE POLICY "Teachers select" ON teachers FOR SELECT USING (true);
CREATE POLICY "Teachers insert" ON teachers FOR INSERT WITH CHECK (true);
CREATE POLICY "Teachers update" ON teachers FOR UPDATE USING (true);
CREATE POLICY "Teachers delete" ON teachers FOR DELETE USING (true);

-- 4. Buses Policies
CREATE POLICY "Buses select" ON buses FOR SELECT USING (true);
CREATE POLICY "Buses insert" ON buses FOR INSERT WITH CHECK (true);
CREATE POLICY "Buses update" ON buses FOR UPDATE USING (true);
CREATE POLICY "Buses delete" ON buses FOR DELETE USING (true);

-- 5. Attendance Logs Policies
CREATE POLICY "Attendance select" ON attendance_logs FOR SELECT USING (true);
CREATE POLICY "Attendance insert" ON attendance_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Attendance update" ON attendance_logs FOR UPDATE USING (true);
CREATE POLICY "Attendance delete" ON attendance_logs FOR DELETE USING (true);

-- 6. Marks Policies
CREATE POLICY "Marks select" ON marks FOR SELECT USING (true);
CREATE POLICY "Marks insert" ON marks FOR INSERT WITH CHECK (true);
CREATE POLICY "Marks update" ON marks FOR UPDATE USING (true);
CREATE POLICY "Marks delete" ON marks FOR DELETE USING (true);

-- 7. Admission Applications Policies
CREATE POLICY "Admissions select" ON admission_applications FOR SELECT USING (true);
CREATE POLICY "Admissions insert" ON admission_applications FOR INSERT WITH CHECK (true);
CREATE POLICY "Admissions update" ON admission_applications FOR UPDATE USING (true);
CREATE POLICY "Admissions delete" ON admission_applications FOR DELETE USING (true);
*/
