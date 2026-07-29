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
const _mem_store = {};
const LOCAL = {
  get(key) {
    const val = _mem_store[key];
    return val !== undefined ? JSON.parse(JSON.stringify(val)) : null;
  },
  set(key, value) {
    _mem_store[key] = JSON.parse(JSON.stringify(value));
    if (key === 'attendanceLogs') {
      const stats = recalculateAttendanceStats(value);
      if (stats) {
        _mem_store['classAttendance'] = stats.classAttendance;
        _mem_store['busAttendance'] = stats.busAttendance;
      }
    }
  },
  remove(key) {
    delete _mem_store[key];
    if (key === 'attendanceLogs') {
      _mem_store['classAttendance'] = {};
      _mem_store['busAttendance'] = {};
    }
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

function getAcademicYearOfDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 2) return '';
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(y) || isNaN(m)) return '';
  if (m >= 6) return `${y}-${(y + 1).toString().substr(2)}`;
  return `${y - 1}-${y.toString().substr(2)}`;
}

function recalculateAttendanceStats(logs) {
  if (!Array.isArray(logs)) return { classAttendance: {}, busAttendance: {} };
  const classAttendance = {};
  const busAttendance = {};
  
  const activeYear = getActiveAcademicYear();

  logs.forEach(log => {
    const studentId = log.studentId;
    if (!studentId) return;

    if (log.type === 'class') {
      if (log.present) {
        const logYear = getAcademicYearOfDate(log.date);
        if (logYear === activeYear) {
          if (!classAttendance[studentId]) {
            classAttendance[studentId] = { year: activeYear, presentCount: 0 };
          }
          classAttendance[studentId].presentCount++;
        }
      }
    } else if (log.type === 'bus' || log.type.startsWith('bus-')) {
      if (log.present) {
        const month = log.date.substring(0, 7); // YYYY-MM
        if (!busAttendance[studentId]) busAttendance[studentId] = {};
        if (!busAttendance[studentId][month]) busAttendance[studentId][month] = 0;
        busAttendance[studentId][month]++;
      }
    }
  });

  return { classAttendance, busAttendance };
}


// Background sync: writes session cache changes to Supabase asynchronously
// Background sync error helper
function handleSyncError(key, err) {
  console.error(`Background sync for '${key}' failed:`, err);
  if (typeof showToast === 'function') {
    showToast(`Syncing ${key} to Supabase failed! Verify your database tables & RLS policies.`, 'danger', 5000);
  }
}

// Background sync: writes session cache changes to Supabase asynchronously by comparing changes with oldValue
function triggerBackgroundSync(key, value, oldValue) {
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
        const oldArray = oldValue || [];
        const oldIds = oldArray.map(s => s.id);
        const newIds = value.map(s => s.id);

        // Deletions
        const toDelete = oldIds.filter(id => !newIds.includes(id));
        if (toDelete.length > 0) {
          // Delete referencing marks and attendance logs first to prevent foreign key errors
          await client.from('marks').delete().in('student_id', toDelete);
          await client.from('attendance_logs').delete().in('student_id', toDelete);
          await client.from('students').delete().in('id', toDelete);
        }

        // Upsertions: Only new or modified students
        const toUpsert = value.filter(s => {
          const old = oldArray.find(o => o.id === s.id);
          if (!old) return true;
          return old.name !== s.name ||
                 old.rollNo !== s.rollNo ||
                 old.dob !== s.dob ||
                 old.classId !== s.classId ||
                 old.type !== s.type ||
                 old.busId !== s.busId ||
                 old.phone !== s.phone ||
                 old.parentName !== s.parentName ||
                 old.academicYear !== s.academicYear;
        });

        if (toUpsert.length > 0) {
          const rows = toUpsert.map(s => ({
            id: s.id,
            roll_no: s.rollNo || '',
            name: s.name || '',
            dob: s.dob || null,
            class_id: s.classId === 'graduated' ? null : (s.classId || null),
            type: s.type || 'dayscholar',
            bus_id: s.busId || null,
            phone: s.phone || null,
            parent_name: s.parentName || null
          }));
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
        const oldArray = oldValue || [];
        const oldIds = oldArray.map(t => t.id);
        const newIds = value.map(t => t.id);

        // Deletions
        const toDelete = oldIds.filter(id => !newIds.includes(id));
        if (toDelete.length > 0) {
          await client.from('teachers').delete().in('id', toDelete);
        }

        // Upsertions
        const toUpsert = value.filter(t => {
          const old = oldArray.find(o => o.id === t.id);
          if (!old) return true;
          return old.name !== t.name ||
                 old.username !== t.username ||
                 old.password !== t.password ||
                 JSON.stringify(old.classId) !== JSON.stringify(t.classId) ||
                 old.phone !== t.phone ||
                 old.email !== t.email ||
                 old.dob !== t.dob;
        });

        if (toUpsert.length > 0) {
          const rows = toUpsert.map(t => ({
            id: t.id,
            name: t.name || '',
            username: t.username || '',
            password: t.password || '',
            class_id: Array.isArray(t.classId) ? JSON.stringify(t.classId) : (t.classId || null),
            phone: t.phone || null,
            email: t.email || null,
            dob: t.dob || null
          }));
          const { error: upsertErr } = await client.from('teachers').upsert(rows);
          if (upsertErr) {
            if (upsertErr.code === '42703' || (upsertErr.message && (upsertErr.message.includes('dob') || upsertErr.message.includes('column')))) {
              console.warn("Supabase 'teachers' table doesn't have 'dob' column. Retrying sync without 'dob'.");
              const rowsWithoutDob = rows.map(({ dob, ...rest }) => rest);
              const { error: retryErr } = await client.from('teachers').upsert(rowsWithoutDob);
              if (retryErr) throw retryErr;
            } else {
              throw upsertErr;
            }
          }
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
        const oldArray = oldValue || [];
        const oldIds = oldArray.map(b => b.id);
        const newIds = value.map(b => b.id);

        // Deletions
        const toDelete = oldIds.filter(id => !newIds.includes(id));
        if (toDelete.length > 0) {
          await client.from('buses').delete().in('id', toDelete);
        }

        // Upsertions
        const toUpsert = value.filter(b => {
          const old = oldArray.find(o => o.id === b.id);
          if (!old) return true;
          return old.number !== b.number ||
                 old.route !== b.route ||
                 old.driver !== b.driver ||
                 old.phone !== b.phone;
        });

        if (toUpsert.length > 0) {
          const rows = toUpsert.map(b => ({
            id: b.id,
            number: b.number || '',
            route: b.route || '',
            driver: b.driver || null,
            phone: b.phone || null
          }));
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
        const oldArray = oldValue || [];
        const oldIds = oldArray.map(c => c.id);
        const newIds = value.map(c => c.id);

        // Deletions
        const toDelete = oldIds.filter(id => !newIds.includes(id));
        if (toDelete.length > 0) {
          await client.from('classes').delete().in('id', toDelete);
        }

        // Upsertions
        const toUpsert = value.filter(c => {
          const old = oldArray.find(o => o.id === c.id);
          if (!old) return true;
          return old.name !== c.name ||
                 old.section !== c.section ||
                 old.grade !== c.grade;
        });

        if (toUpsert.length > 0) {
          const rows = toUpsert.map(c => ({
            id: c.id,
            name: c.name || '',
            section: c.section || '',
            grade: c.grade === 'LKG' ? -2 : c.grade === 'UKG' ? -1 : (Number(c.grade) || 0)
          }));
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
        const oldArray = oldValue || [];
        const newArray = value || [];

        const toDelete = [];
        const toUpsert = [];

        // Deleted records
        oldArray.forEach(o => {
          const exists = newArray.some(n => n.studentId === o.studentId && n.date === o.date && n.type === o.type);
          if (!exists) toDelete.push(o);
        });

        // New or modified records
        newArray.forEach(n => {
          const old = oldArray.find(o => o.studentId === n.studentId && o.date === n.date && o.type === n.type);
          if (!old || old.present !== n.present) toUpsert.push(n);
        });

        for (const log of toDelete) {
          await client.from('attendance_logs').delete()
            .eq('student_id', log.studentId)
            .eq('date', log.date)
            .eq('type', log.type);
        }

        if (toUpsert.length > 0) {
          const rows = toUpsert.map(l => ({
            student_id: l.studentId,
            date: l.date,
            type: l.type,
            present: l.present
          }));
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
        const oldObj = oldValue || {};
        const newObj = value || {};

        const toDelete = [];
        const toUpsert = [];

        const flattenMarks = (obj) => {
          const arr = [];
          for (const sId in obj) {
            for (const sub in obj[sId]) {
              for (const exam in obj[sId][sub]) {
                const val = obj[sId][sub][exam];
                if (val !== null && typeof val === 'object') {
                  for (const key in val) {
                    if (key === 'Total' || key === 'GRADE') {
                      arr.push({ studentId: sId, subject: sub, exam: exam, val: val[key] });
                    } else {
                      arr.push({ studentId: sId, subject: `${sub}_${key}`, exam: exam, val: val[key] });
                    }
                  }
                } else {
                  arr.push({ studentId: sId, subject: sub, exam: exam, val: val });
                }
              }
            }
          }
          return arr;
        };

        const oldRecords = flattenMarks(oldObj);
        const newRecords = flattenMarks(newObj);

        // Deleted records
        oldRecords.forEach(o => {
          const exists = newRecords.some(n => n.studentId === o.studentId && n.subject === o.subject && n.exam === o.exam);
          if (!exists) toDelete.push(o);
        });

        // New/modified records
        newRecords.forEach(n => {
          const old = oldRecords.find(o => o.studentId === n.studentId && o.subject === n.subject && o.exam === n.exam);
          if (!old || old.val !== n.val) toUpsert.push(n);
        });

        for (const m of toDelete) {
          await client.from('marks').delete()
            .eq('student_id', m.studentId)
            .eq('subject', m.subject)
            .eq('exam', m.exam);
        }

        if (toUpsert.length > 0) {
          const rows = toUpsert.map(r => ({
            student_id: r.studentId,
            subject: r.subject,
            exam: r.exam,
            marks_obtained: Number(r.val) || 0
          }));
          const { error: upsertErr } = await client.from('marks').upsert(rows, { onConflict: 'student_id,subject,exam' });
          if (upsertErr) throw upsertErr;
        }
      } catch (err) {
        handleSyncError('marks', err);
        throw err;
      }
    })();
  }

  else if (key === 'subjects' || key === 'subjectMaxMarks') {
    return (async () => {
      try {
        const subjectsObj = LOCAL.get('subjects') || {};
        const maxMarksObj = LOCAL.get('subjectMaxMarks') || {};
        
        const newRows = [];
        for (const cId in subjectsObj) {
          const classSubs = subjectsObj[cId] || [];
          classSubs.forEach(sub => {
            const maxM = (maxMarksObj[cId] && maxMarksObj[cId][sub] !== undefined) ? maxMarksObj[cId][sub] : 100;
            newRows.push({ class_id: cId, subject: sub, max_marks: maxM });
          });
        }
        
        const { data: existingRows, error: fetchErr } = await client.from('class_subjects').select('*');
        if (fetchErr) {
          console.warn('class_subjects table not configured on Supabase. Skipping remote push:', fetchErr.message);
          return;
        }
        
        const toDelete = [];
        existingRows.forEach(oldRow => {
          const stillExists = newRows.some(n => n.class_id === oldRow.class_id && n.subject === oldRow.subject);
          if (!stillExists) toDelete.push(oldRow);
        });
        
        for (const row of toDelete) {
          await client.from('class_subjects').delete()
            .eq('class_id', row.class_id)
            .eq('subject', row.subject);
        }
        
        if (newRows.length > 0) {
          const { error: upsertErr } = await client.from('class_subjects').upsert(newRows, { onConflict: 'class_id,subject' });
          if (upsertErr) throw upsertErr;
        }
      } catch (err) {
        handleSyncError('subjects configuration', err);
        throw err;
      }
    })();
  }

  else if (key === 'admissions') {
    return Promise.resolve();
  }

  else if (key === 'studentBilling') {
    return (async () => {
      try {
        const arr = Array.isArray(value) ? value : [];
        if (arr.length === 0) return;

        // Determine changed records vs old value
        const oldArr = Array.isArray(oldValue) ? oldValue : [];
        const toUpsert = arr.filter(b => {
          const old = oldArr.find(o => o.studentId === b.studentId);
          if (!old) return true;
          return (
            old.totalFee !== b.totalFee ||
            old.totalFeePaid !== b.totalFeePaid ||
            old.currentMonthStatus !== b.currentMonthStatus ||
            old.paidMonths !== b.paidMonths ||
            old.lastPaidDate !== b.lastPaidDate ||
            old.admissionFee !== b.admissionFee ||
            old.busFee !== b.busFee
          );
        });

        if (toUpsert.length === 0) return;

        const rows = toUpsert.map(b => ({
          student_id: b.studentId,
          student_name: b.studentName || '',
          total_fee: Number(b.totalFee) || 0,
          total_fee_paid: Number(b.totalFeePaid) || 0,
          current_month_status: b.currentMonthStatus || 'unpaid',
          paid_months: typeof b.paidMonths === 'object' ? JSON.stringify(b.paidMonths) : (b.paidMonths || null),
          last_paid_date: b.lastPaidDate || null,
          bus_fee: Number(b.busFee) || 0,
          admission_fee: Number(b.admissionFee) || 0
        }));

        const { error: upsertErr } = await client
          .from('student_billing')
          .upsert(rows, { onConflict: 'student_id' });
        if (upsertErr) {
          // Fallback: try without optional columns that may not exist yet
          const rowsBase = rows.map(({ bus_fee, admission_fee, ...rest }) => rest);
          const { error: retryErr } = await client
            .from('student_billing')
            .upsert(rowsBase, { onConflict: 'student_id' });
          if (retryErr) throw retryErr;
        }
      } catch (err) {
        handleSyncError('student billing', err);
        throw err;
      }
    })();
  }

  else if (key === 'busStops') {
    return (async () => {
      try {
        const oldArray = oldValue || [];
        const oldIds = oldArray.map(bs => bs.id);
        const newIds = value.map(bs => bs.id);

        const toDelete = oldIds.filter(id => !newIds.includes(id));
        if (toDelete.length > 0) {
          // Try to delete from bus_stops table; skip gracefully if table doesn't exist
          try { await client.from('bus_stops').delete().in('id', toDelete); } catch(e) {}
        }

        const toUpsert = value.filter(bs => {
          const old = oldArray.find(o => o.id === bs.id);
          if (!old) return true;
          return old.name !== bs.name || old.fee !== bs.fee || old.busId !== bs.busId;
        });

        if (toUpsert.length > 0) {
          const rows = toUpsert.map(bs => ({
            id: bs.id,
            name: bs.name || '',
            fee: Number(bs.fee) || 0,
            bus_id: bs.busId || null
          }));
          try { await client.from('bus_stops').upsert(rows); } catch(e) { console.warn('bus_stops table may not exist yet:', e.message); }
        }
      } catch (err) {
        console.warn('busStops sync skipped (table may not exist):', err.message);
      }
    })();
  }

  return Promise.resolve();
}

// Helper to reconstruct flat db rows into student-specific subject/exam marks object
function reconstructStudentMarks(rows) {
  const sMarks = {};
  rows.forEach(m => {
    const parts = m.subject.split('_');
    if (parts.length > 1) {
      const baseSub = parts[0];
      const subcol = parts[1];
      if (!sMarks[baseSub]) sMarks[baseSub] = {};
      if (!sMarks[baseSub][m.exam]) sMarks[baseSub][m.exam] = {};
      
      if (typeof sMarks[baseSub][m.exam] !== 'object' || sMarks[baseSub][m.exam] === null) {
        const prevVal = sMarks[baseSub][m.exam];
        sMarks[baseSub][m.exam] = { Total: prevVal, GRADE: prevVal };
      }
      sMarks[baseSub][m.exam][subcol] = m.marks_obtained;
    } else {
      if (!sMarks[m.subject]) sMarks[m.subject] = {};
      const existing = sMarks[m.subject][m.exam];
      if (existing !== undefined && typeof existing === 'object' && existing !== null) {
        existing.Total = m.marks_obtained;
        existing.GRADE = m.marks_obtained;
      } else {
        sMarks[m.subject][m.exam] = m.marks_obtained;
      }
    }
  });
  return sMarks;
}

// Helper to reconstruct flat db rows into all student marks cache object
function reconstructAllMarks(rows) {
  const marksObj = {};
  rows.forEach(m => {
    const sId = m.student_id;
    if (!marksObj[sId]) marksObj[sId] = {};
    
    const parts = m.subject.split('_');
    if (parts.length > 1) {
      const baseSub = parts[0];
      const subcol = parts[1];
      if (!marksObj[sId][baseSub]) marksObj[sId][baseSub] = {};
      if (!marksObj[sId][baseSub][m.exam]) marksObj[sId][baseSub][m.exam] = {};
      
      if (typeof marksObj[sId][baseSub][m.exam] !== 'object' || marksObj[sId][baseSub][m.exam] === null) {
        const prevVal = marksObj[sId][baseSub][m.exam];
        marksObj[sId][baseSub][m.exam] = { Total: prevVal, GRADE: prevVal };
      }
      marksObj[sId][baseSub][m.exam][subcol] = m.marks_obtained;
    } else {
      if (!marksObj[sId][m.subject]) marksObj[sId][m.subject] = {};
      const existing = marksObj[sId][m.subject][m.exam];
      if (existing !== undefined && typeof existing === 'object' && existing !== null) {
        existing.Total = m.marks_obtained;
        existing.GRADE = m.marks_obtained;
      } else {
        marksObj[sId][m.subject][m.exam] = m.marks_obtained;
      }
    }
  });
  return marksObj;
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
    const oldValue = LOCAL.get(key);
    LOCAL.set(key, value);
    triggerBackgroundSync(key, value, oldValue).catch(err => {
      console.error('Background sync failed:', err);
    });
    return Promise.resolve();
  },
  remove(key) {
    const oldValue = LOCAL.get(key);
    LOCAL.remove(key);
    triggerBackgroundSync(key, [], oldValue).catch(err => {
      console.error('Background sync failed:', err);
    });
    return Promise.resolve();
  },

  getLocal: (key) => LOCAL.get(key),
  setLocal: (key, value) => {
    const oldValue = LOCAL.get(key);
    LOCAL.set(key, value);
    return triggerBackgroundSync(key, value, oldValue);
  },
  removeLocal: (key) => {
    const oldValue = LOCAL.get(key);
    LOCAL.remove(key);
    return triggerBackgroundSync(key, [], oldValue);
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
    return reconstructStudentMarks(data);
  },

  // ── Billing convenience methods ─────────────────────────────────────
  /**
   * setBilling – upserts a single student's billing record.
   * Updates local cache and triggers Supabase background sync.
   */
  setBilling(studentId, updates) {
    const list = LOCAL.get('studentBilling') || [];
    const oldList = JSON.parse(JSON.stringify(list));
    const idx = list.findIndex(b => b.studentId === studentId);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updates, studentId };
    } else {
      list.push({ studentId, ...updates });
    }
    LOCAL.set('studentBilling', list);
    return triggerBackgroundSync('studentBilling', list, oldList).catch(err => {
      console.error('Billing sync failed:', err);
    });
  },

  /**
   * getBillingAll – returns all billing records, preferring Supabase.
   */
  async getBillingAll() {
    if (!SUPABASE_CONFIGURED) return LOCAL.get('studentBilling') || [];
    const { data, error } = await getSupabase().from('student_billing').select('*');
    if (error) {
      console.error('Supabase getBillingAll:', error);
      return LOCAL.get('studentBilling') || [];
    }
    // If Supabase returned rows, map and cache them.
    // If empty (new install / RLS / not synced yet), preserve the local cache
    // so that locally-entered billing data is NOT destroyed.
    if (!data || data.length === 0) {
      return LOCAL.get('studentBilling') || [];
    }
    const mapped = data.map(b => ({
      id: b.id,
      studentId: b.student_id,
      studentName: b.student_name,
      totalFee: Number(b.total_fee) || 0,
      totalFeePaid: Number(b.total_fee_paid) || 0,
      balanceFee: Number(b.balance_fee) || 0,
      currentMonthStatus: b.current_month_status || 'unpaid',
      paidMonths: (() => {
        try {
          if (!b.paid_months) return {};
          if (typeof b.paid_months === 'object') return b.paid_months;
          return JSON.parse(b.paid_months);
        } catch { return {}; }
      })(),
      lastPaidDate: b.last_paid_date,
      admissionFee: Number(b.admission_fee) || 0,
      busFee: Number(b.bus_fee) || 0,
      updatedAt: b.updated_at
    }));
    // Merge: Supabase rows take priority, but keep any local-only rows
    // (studentId not yet in Supabase) so offline data is preserved.
    const localList = LOCAL.get('studentBilling') || [];
    const supabaseIds = new Set(mapped.map(b => b.studentId));
    const localOnly = localList.filter(b => !supabaseIds.has(b.studentId));
    const merged = [...mapped, ...localOnly];
    LOCAL.set('studentBilling', merged);
    return merged;
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
    const val = record.marksObtained;
    if (val !== null && typeof val === 'object') {
      const promises = [];
      for (const key in val) {
        const subName = (key === 'Total' || key === 'GRADE') ? record.subject : `${record.subject}_${key}`;
        promises.push(
          getSupabase().from('marks').upsert([{
            student_id: record.studentId, subject: subName,
            exam: record.exam, marks_obtained: Number(val[key]) || 0
          }], { onConflict: 'student_id,subject,exam' })
        );
      }
      const results = await Promise.all(promises);
      const firstErr = results.find(r => r.error);
      return firstErr ? { error: firstErr.error } : { error: null };
    }
    return await getSupabase().from('marks').upsert([{
      student_id: record.studentId, subject: record.subject,
      exam: record.exam, marks_obtained: Number(record.marksObtained) || 0
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
          parent_name: 'parentName'
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

      // 5. Admissions - Bypassed from Supabase since table is removed / Google Form managed
      LOCAL.set('admissions', LOCAL.get('admissions') || []);

      // 8. Class Subjects & Max Marks
      try {
        const { data: subData, error: errSub } = await client.from('class_subjects').select('*');
        if (errSub) {
          console.warn('class_subjects table not configured on Supabase, falling back to local defaults:', errSub.message);
        } else if (subData) {
          const subjectsObj = {};
          const maxMarksObj = {};
          
          subData.forEach(row => {
            const cId = row.class_id;
            if (!subjectsObj[cId]) subjectsObj[cId] = [];
            subjectsObj[cId].push(row.subject);
            
            if (!maxMarksObj[cId]) maxMarksObj[cId] = {};
            maxMarksObj[cId][row.subject] = row.max_marks;
          });
          
          LOCAL.set('subjects', subjectsObj);
          LOCAL.set('subjectMaxMarks', maxMarksObj);
        }
      } catch (e) {
        console.warn('Failed to load class_subjects from Supabase:', e);
      }

      // 11b. Bus Stops
      try {
        const { data: busStops, error: errBusStops } = await client.from('bus_stops').select('*');
        if (!errBusStops && busStops) {
          const mapped = busStops.map(bs => mapKeys(bs, { bus_id: 'busId' }));
          LOCAL.set('busStops', mapped);
        }
      } catch (e) {
        console.warn('bus_stops table not found on Supabase (optional), using local:', e.message);
      }

      window.dispatchEvent(new Event('mss-db-sync'));
    } catch (error) {
      console.error('Supabase pullAllFromSupabase failed:', error);
      if (typeof showToast === 'function') {
        showToast('Failed to load data from Supabase. Verify database tables and RLS permissions.', 'danger', 5000);
      }
      throw error;
    }
  },

  /**
   * fetchStudentData – lightweight per-student fetch.
   * Pulls attendance logs, marks, and billing for ONE student only.
   * Designed for 500+ student scale on Vercel free tier.
   */
  async fetchStudentData(studentId) {
    const activeYear = getActiveAcademicYear();
    const y = parseInt(activeYear.split('-')[0], 10);
    const yearStart = y + '-06-01';
    const yearEnd = (y + 1) + '-05-31';

    try {
      const client = getSupabase();

      const { data: logs, error: logsErr } = await client.from('attendance_logs')
        .select('*')
        .eq('student_id', studentId)
        .gte('date', yearStart)
        .lte('date', yearEnd);
      if (logsErr) throw logsErr;
      if (logs) {
        const mappedLogs = logs.map(l => ({
          studentId: l.student_id,
          date: l.date,
          type: l.type,
          present: l.present,
          recordedAt: l.recorded_at
        }));
        LOCAL.set('attendanceLogs', mappedLogs);
      }

      const { data: marks, error: marksErr } = await client.from('marks')
        .select('*')
        .eq('student_id', studentId);
      if (marksErr) throw marksErr;
      if (marks) {
        const currentMarksObj = LOCAL.get('marks') || {};
        currentMarksObj[studentId] = reconstructStudentMarks(marks);
        LOCAL.set('marks', currentMarksObj);
      }

      const { data: billing, error: billErr } = await client.from('student_billing')
        .select('*')
        .eq('student_id', studentId);
      if (!billErr && billing) {
        const mapped = billing.map(b => ({
          id: b.id,
          studentId: b.student_id,
          studentName: b.student_name,
          totalFee: b.total_fee,
          totalFeePaid: b.total_fee_paid,
          balanceFee: b.balance_fee,
          currentMonthStatus: b.current_month_status,
          paidMonths: b.paid_months || null,
          lastPaidDate: b.last_paid_date,
          updatedAt: b.updated_at
        }));
        LOCAL.set('studentBilling', mapped);
      } else if (billErr) {
        console.warn('student_billing fetch error:', billErr.message);
      }

      return true;
    } catch (err) {
      console.error('fetchStudentData failed:', err);
      if (typeof showToast === 'function') {
        showToast('Failed to load your data. Please try again.', 'danger');
      }
      return false;
    }
  },

  /**
   * fetchAllExtendedData – bulk fetch for admin/teacher dashboards.
   * Pulls attendance logs, marks, and billing for ALL students (current academic year only).
   * Intentionally NOT called from pullAllFromSupabase to keep portal lightweight.
   */
  async fetchAllExtendedData() {
    const activeYear = getActiveAcademicYear();
    const y = parseInt(activeYear.split('-')[0], 10);
    const yearStart = y + '-06-01';
    const yearEnd = (y + 1) + '-05-31';

    try {
      const client = getSupabase();

      const { data: logs, error: logsErr } = await client.from('attendance_logs')
        .select('*')
        .gte('date', yearStart)
        .lte('date', yearEnd);
      if (logsErr) throw logsErr;
      if (logs) {
        const mappedLogs = logs.map(l => ({
          studentId: l.student_id,
          date: l.date,
          type: l.type,
          present: l.present,
          recordedAt: l.recorded_at
        }));
        LOCAL.set('attendanceLogs', mappedLogs);
      }

      const { data: marks, error: marksErr } = await client.from('marks').select('*');
      if (marksErr) throw marksErr;
      if (marks) {
        LOCAL.set('marks', reconstructAllMarks(marks));
      }

      const { data: billing, error: billErr } = await client.from('student_billing').select('*');
      if (billErr) {
        console.warn('student_billing fetch error:', billErr.message);
        // Preserve existing local cache on error
      } else if (billing && billing.length > 0) {
        // Only update cache when Supabase actually has rows.
        // An empty result (new install / not yet synced) must NOT wipe local data.
        const mapped = billing.map(b => ({
          id: b.id,
          studentId: b.student_id,
          studentName: b.student_name,
          totalFee: Number(b.total_fee) || 0,
          totalFeePaid: Number(b.total_fee_paid) || 0,
          balanceFee: Number(b.balance_fee) || 0,
          currentMonthStatus: b.current_month_status || 'unpaid',
          paidMonths: (() => {
            try {
              if (!b.paid_months) return {};
              if (typeof b.paid_months === 'object') return b.paid_months;
              return JSON.parse(b.paid_months);
            } catch { return {}; }
          })(),
          lastPaidDate: b.last_paid_date,
          admissionFee: Number(b.admission_fee) || 0,
          busFee: Number(b.bus_fee) || 0,
          updatedAt: b.updated_at
        }));
        // Merge with local-only records so offline data is preserved
        const localList = LOCAL.get('studentBilling') || [];
        const supabaseIds = new Set(mapped.map(b => b.studentId));
        const localOnly = localList.filter(b => !supabaseIds.has(b.studentId));
        LOCAL.set('studentBilling', [...mapped, ...localOnly]);
      }

      return true;
    } catch (err) {
      console.error('fetchAllExtendedData failed:', err);
      return false;
    }
  }
};

window.DB = DB;

// Pull fresh data from Supabase on every new browser session.
// sessionStorage is empty at session start so this always runs.
// Unconditionally pull fresh data from Supabase on every page load to guarantee real-time updates and avoid stale cache issues.
// Pull fresh data from Supabase on every new browser session.
// sessionStorage is empty at session start so this always runs.
// Unconditionally pull fresh data from Supabase on every page load to guarantee real-time updates and avoid stale cache issues.
setTimeout(() => {
  DB.pullAllFromSupabase()
    .catch(err => {
      console.warn('Initial Supabase pull failed (using local cache):', err);
      // CRITICAL: dispatch sync event even on failure so login buttons enable
      // and pages can function with locally cached data (offline mode).
      window.dispatchEvent(new Event('mss-db-sync'));
    });
}, 200);

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
  dob DATE, -- Added for teacher birthdays
  created_at TIMESTAMPTZ DEFAULT now()
);
-- To apply to existing tables: ALTER TABLE teachers ADD COLUMN dob DATE;

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
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('class', 'bus', 'bus-morning', 'bus-evening')),
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

-- 8. Class Subjects Schema & Policies
-- Run this to create the class_subjects table:
CREATE TABLE IF NOT EXISTS class_subjects (
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  max_marks INTEGER DEFAULT 100,
  PRIMARY KEY (class_id, subject)
);

ALTER TABLE class_subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Subjects select" ON class_subjects FOR SELECT USING (true);
CREATE POLICY "Subjects insert" ON class_subjects FOR INSERT WITH CHECK (true);
CREATE POLICY "Subjects update" ON class_subjects FOR UPDATE USING (true);
CREATE POLICY "Subjects delete" ON class_subjects FOR DELETE USING (true);

-- 14. Bus Stops table & policies (optional: for per-place bus stop management)
CREATE TABLE IF NOT EXISTS bus_stops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  fee INTEGER NOT NULL DEFAULT 0,
  bus_id TEXT REFERENCES buses(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE bus_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "BusStops select" ON bus_stops FOR SELECT USING (true);
CREATE POLICY "BusStops insert" ON bus_stops FOR INSERT WITH CHECK (true);
CREATE POLICY "BusStops update" ON bus_stops FOR UPDATE USING (true);
CREATE POLICY "BusStops delete" ON bus_stops FOR DELETE USING (true);

*/
