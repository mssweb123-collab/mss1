/* ============================================
   MSS SCHOOL - Supabase Client & Data Layer
   ============================================ */

'use strict';

// ─── SUPABASE CONFIG ───────────────────────────────────────────────────────
// Replace these with your actual Supabase project credentials
let SUPABASE_URL = localStorage.getItem('supabase_url') || 'https://YOUR_PROJECT_REF.supabase.co';
let SUPABASE_ANON_KEY = localStorage.getItem('supabase_key') || 'YOUR_ANON_KEY_HERE';

// Detect if Supabase is configured
function isSupabaseConfigured() {
  return SUPABASE_URL && SUPABASE_URL !== 'https://YOUR_PROJECT_REF.supabase.co' &&
         SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== 'YOUR_ANON_KEY_HERE';
}

let SUPABASE_CONFIGURED = isSupabaseConfigured();

// ─── LOAD SUPABASE SDK ────────────────────────────────────────────────────
// Using CDN – already imported via <script> in HTML, exposed as window.supabase
let _supabaseClient = null;

function getSupabase() {
  if (_supabaseClient) return _supabaseClient;
  if (typeof window !== 'undefined' && window.supabase) {
    if (isSupabaseConfigured()) {
      _supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return _supabaseClient;
    }
  }
  throw new Error('Supabase SDK not loaded or not configured');
}

// ─── OFFLINE / FALLBACK LAYER (localStorage mirror) ──────────────────────
// If Supabase is not configured yet, fall back to localStorage gracefully
const LOCAL = {
  get(key) {
    try {
      if (['students', 'attendanceLogs', 'marks', 'classAttendance', 'busAttendance'].includes(key)) {
        const activeYear = localStorage.getItem('mss_activeAcademicYear');
        if (activeYear) {
          const val = localStorage.getItem('mss_' + key + '_' + activeYear);
          if (val !== null) {
            return JSON.parse(val);
          }
        }
      }
      return JSON.parse(localStorage.getItem('mss_' + key)) || null;
    }
    catch { return null; }
  },
  set(key, value) {
    if (['students', 'attendanceLogs', 'marks', 'classAttendance', 'busAttendance'].includes(key)) {
      const activeYear = localStorage.getItem('mss_activeAcademicYear');
      if (activeYear) {
        localStorage.setItem('mss_' + key + '_' + activeYear, JSON.stringify(value));
        localStorage.setItem('mss_' + key, JSON.stringify(value));
        return;
      }
    }
    localStorage.setItem('mss_' + key, JSON.stringify(value));
  },
  remove(key) {
    if (['students', 'attendanceLogs', 'marks', 'classAttendance', 'busAttendance'].includes(key)) {
      const activeYear = localStorage.getItem('mss_activeAcademicYear');
      if (activeYear) {
        localStorage.removeItem('mss_' + key + '_' + activeYear);
      }
    }
    localStorage.removeItem('mss_' + key);
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

// Background sync helper to push local state modifications to remote Supabase DB asynchronously
function triggerBackgroundSync(key, value) {
  if (!SUPABASE_CONFIGURED) return;
  
  let client;
  try {
    client = getSupabase();
  } catch (e) {
    console.warn("Supabase not fully loaded/configured for background sync:", e);
    return;
  }

  const activeYear = getActiveAcademicYear();

  if (key === 'students') {
    (async () => {
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
        console.error('Background sync students failed:', err);
      }
    })();
  }
  
  else if (key === 'teachers') {
    (async () => {
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
        console.error('Background sync teachers failed:', err);
      }
    })();
  }
  
  else if (key === 'buses') {
    (async () => {
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
        console.error('Background sync buses failed:', err);
      }
    })();
  }
  
  else if (key === 'classes') {
    (async () => {
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
        console.error('Background sync classes failed:', err);
      }
    })();
  }
  
  else if (key === 'attendanceLogs') {
    (async () => {
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
        console.error('Background sync attendance logs failed:', err);
      }
    })();
  }
  
  else if (key === 'marks') {
    (async () => {
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
        console.error('Background sync marks failed:', err);
      }
    })();
  }
  
  else if (key === 'admissions') {
    (async () => {
      try {
        for (const a of value) {
          const { data: existing } = await client.from('admission_applications')
            .select('id')
            .eq('student_name', a.admName || a.student_name || '')
            .eq('dob', a.admDob || a.dob || null)
            .eq('phone', a.phone || '')
            .limit(1);
            
          const mapped = {
            student_name: a.admName || a.student_name || '',
            dob: a.admDob || a.dob || null,
            gender: a.admGender || a.gender || '',
            applying_class: a.admClass || a.applying_class || '',
            nationality: a.nationality || 'Indian',
            religion: a.religion || '',
            father_name: a.admFather || a.father_name || '',
            mother_name: a.admMother || a.mother_name || '',
            phone: a.phone || '',
            email: a.email || '',
            address: a.address || '',
            father_occupation: a.occFather || a.father_occupation || '',
            annual_income: a.income || a.annual_income || '',
            prev_school: a.prevSchool || a.prev_school || '',
            last_class: a.lastClass || a.last_class || '',
            transport: a.transport || 'dayscholar',
            notes: a.notes || '',
            status: a.status || 'pending',
            submitted_at: a.submittedAt || a.submitted_at || new Date().toISOString()
          };
          
          if (existing && existing.length > 0) {
            await client.from('admission_applications').update(mapped).eq('id', existing[0].id);
          } else {
            await client.from('admission_applications').insert([mapped]);
          }
        }
      } catch (err) {
        console.error('Background sync admissions failed:', err);
      }
    })();
  }
}

// ─── UNIFIED DB LAYER ────────────────────────────────────────────────────
/**
 * DB provides async wrappers around Supabase tables.
 * Falls back to localStorage when Supabase is not configured.
 */
var DB = {
  // ── Unified Storage API for compatibility with app.js ───────────────
  get(key) { return LOCAL.get(key); },
  set(key, value) {
    LOCAL.set(key, value);
    if (SUPABASE_CONFIGURED) {
      triggerBackgroundSync(key, value);
    }
  },
  remove(key) {
    LOCAL.remove(key);
    if (SUPABASE_CONFIGURED) {
      // Deletions are handled by sync handlers (e.g. syncing classes/students list will delete the missing elements)
      triggerBackgroundSync(key, []);
    }
  },

  // ── Local fallback (sync) ─────────────────────────────────────────────
  getLocal: (key) => LOCAL.get(key),
  setLocal: (key, value) => {
    LOCAL.set(key, value);
    if (SUPABASE_CONFIGURED) {
      triggerBackgroundSync(key, value);
    }
  },
  removeLocal: (key) => {
    LOCAL.remove(key);
    if (SUPABASE_CONFIGURED) {
      triggerBackgroundSync(key, []);
    }
  },

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
    if (!SUPABASE_CONFIGURED) {
      const apps = LOCAL.get('admissions') || [];
      apps.push({ ...formData, id: genId('app'), submittedAt: new Date().toISOString(), status: 'pending' });
      LOCAL.set('admissions', apps);
      return { data: formData, error: null };
    }
    return await getSupabase().from('admission_applications').insert([{
      ...formData, status: 'pending', submitted_at: new Date().toISOString()
    }]).select().single();
  },

  async getAdmissions() {
    if (!SUPABASE_CONFIGURED) return LOCAL.get('admissions') || [];
    const { data, error } = await getSupabase().from('admission_applications').select('*').order('submitted_at', { ascending: false });
    if (error) return [];
    return data;
  },

  // ── Supabase Configuration and Synchronization Methods ───────────────
  configureSupabase(url, key) {
    try {
      if (!url || !key) {
        localStorage.removeItem('supabase_url');
        localStorage.removeItem('supabase_key');
        SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
        SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';
        SUPABASE_CONFIGURED = false;
        _supabaseClient = null;
        window.dispatchEvent(new Event('mss-db-sync'));
        return true;
      }
      const client = window.supabase.createClient(url, key);
      if (client) {
        localStorage.setItem('supabase_url', url);
        localStorage.setItem('supabase_key', key);
        SUPABASE_URL = url;
        SUPABASE_ANON_KEY = key;
        SUPABASE_CONFIGURED = true;
        _supabaseClient = client;
        window.dispatchEvent(new Event('mss-db-sync'));
        return true;
      }
    } catch (e) {
      console.error('Failed to configure Supabase:', e);
    }
    return false;
  },

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

      // 7. Admissions
      const { data: admissions, error: errAdmissions } = await client.from('admission_applications').select('*').order('submitted_at', { ascending: false });
      if (errAdmissions) {
        console.error('Supabase pull admissions failed:', errAdmissions);
      } else if (admissions) {
        const mappedAdmissions = admissions.map(a => ({
          id: 'app_' + a.id,
          admName: a.student_name,
          admDob: a.dob,
          admGender: a.gender,
          admClass: a.applying_class,
          nationality: a.nationality,
          religion: a.religion,
          admFather: a.father_name,
          admMother: a.mother_name,
          phone: a.phone,
          email: a.email,
          address: a.address,
          occFather: a.father_occupation,
          income: a.annual_income,
          prevSchool: a.prev_school,
          lastClass: a.last_class,
          transport: a.transport,
          notes: a.notes,
          status: a.status,
          submittedAt: a.submitted_at
        }));
        LOCAL.set('admissions', mappedAdmissions);
      }

      localStorage.setItem('mss_last_supabase_pull', Date.now().toString());
      window.dispatchEvent(new Event('mss-db-sync'));
    } catch (error) {
      console.error('Supabase pullAllFromSupabase failed:', error);
      throw error;
    }
  }
};

window.DB = DB;

// Automatically pull latest data from Supabase in the background on page load if configured and cache has expired (15-min TTL)
if (isSupabaseConfigured()) {
  const cacheTTL = 15 * 60 * 1000; // 15 minutes
  const lastPull = localStorage.getItem('mss_last_supabase_pull');
  const now = Date.now();
  if (!lastPull || (now - parseInt(lastPull, 10)) > cacheTTL) {
    setTimeout(() => {
      DB.pullAllFromSupabase().catch(err => {
        console.warn("Initial Supabase background pull failed (using local cache fallback):", err);
      });
    }, 200);
  }
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

-- Public read for classes (for admission form dropdowns)
CREATE POLICY "Public read classes" ON classes FOR SELECT USING (true);

-- Admission applications: anyone can insert
CREATE POLICY "Anyone can apply" ON admission_applications FOR INSERT WITH CHECK (true);

-- For a production app, use Supabase Auth and role-based policies
*/
