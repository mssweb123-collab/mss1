/* ============================================
   MSS SCHOOL - Core Application Logic
   Uses localStorage for all data storage
   ============================================ */

'use strict';

// ============================================
// CRYPTOGRAPHY / SHA-256
// ============================================
function sha256(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  
  var mathPow = Math.pow;
  var maxWord = mathPow(2, 32);
  var lengthProperty = 'length';
  var i, j;

  var result = '';

  var words = [];
  var asciiLength = ascii[lengthProperty];
  var hash = sha256.h = sha256.h || [];
  var k = sha256.k = sha256.k || [];
  var primeCounter = k[lengthProperty];

  var isComposite = {};
  for (var candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = 1;
      }
      hash[primeCounter] = (mathPow(candidate, .5)*maxWord)|0;
      k[primeCounter++] = (mathPow(candidate, 1/3)*maxWord)|0;
    }
  }
  
  ascii += '\x80';
  while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return; // UTF-8 check
    words[i >> 2] |= j << ((3 - i % 4) * 8);
  }
  words[words[lengthProperty]] = ((asciiLength * 8) / maxWord) | 0;
  words[words[lengthProperty]] = (asciiLength * 8);
  
  for (j = 0; j < words[lengthProperty];) {
    var w = words.slice(j, j += 16);
    var oldHash = hash.slice(0);
    
    hash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      var w15 = w[i - 15], w2 = w[i - 2];
      
      var s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      var s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      
      var ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      var maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      
      var temp1 = hash[7] + (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) + ch + k[i] + (w[i] = (i < 16 ? w[i] : (w[i - 16] + s0 + w[i - 7] + s1) | 0));
      var temp2 = (rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)) + maj;
      
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }
    
    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }
  
  for (i = 0; i < 8; i++) {
    var word = hash[i];
    result += ((word >>> 24) & 255).toString(16).padStart(2, '0') +
              ((word >>> 16) & 255).toString(16).padStart(2, '0') +
              ((word >>> 8) & 255).toString(16).padStart(2, '0') +
              (word & 255).toString(16).padStart(2, '0');
  }
  
  return result;
}

// ============================================
// DATA LAYER
// ============================================
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
  
  let activeYear = '';
  if (typeof currentAcademicYear === 'function') {
    activeYear = currentAcademicYear();
  } else {
    activeYear = sessionStorage.getItem('mss_activeAcademicYear') || localStorage.getItem('mss_activeAcademicYear') || '';
  }

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

const _fallback_mem_store = {};
var DB = window.DB || {
  get(key) {
    if (['students', 'attendanceLogs', 'marks', 'classAttendance', 'busAttendance'].includes(key)) {
      const activeYear = localStorage.getItem('mss_activeAcademicYear');
      if (activeYear) {
        const val = _fallback_mem_store[key + '_' + activeYear];
        if (val !== undefined) return JSON.parse(JSON.stringify(val));
      }
    }
    const val = _fallback_mem_store[key];
    return val !== undefined ? JSON.parse(JSON.stringify(val)) : null;
  },
  set(key, value) {
    const valCopy = JSON.parse(JSON.stringify(value));
    if (['students', 'attendanceLogs', 'marks', 'classAttendance', 'busAttendance'].includes(key)) {
      const activeYear = localStorage.getItem('mss_activeAcademicYear');
      if (activeYear) {
        _fallback_mem_store[key + '_' + activeYear] = valCopy;
        _fallback_mem_store[key] = valCopy;
        
        if (key === 'attendanceLogs') {
          const stats = recalculateAttendanceStats(value);
          if (stats) {
            _fallback_mem_store['classAttendance_' + activeYear] = stats.classAttendance;
            _fallback_mem_store['classAttendance'] = stats.classAttendance;
            _fallback_mem_store['busAttendance_' + activeYear] = stats.busAttendance;
            _fallback_mem_store['busAttendance'] = stats.busAttendance;
          }
        }
        
        return Promise.resolve();
      }
    }
    _fallback_mem_store[key] = valCopy;
    return Promise.resolve();
  },
  remove(key) {
    if (['students', 'attendanceLogs', 'marks', 'classAttendance', 'busAttendance'].includes(key)) {
      const activeYear = localStorage.getItem('mss_activeAcademicYear');
      if (activeYear) {
        delete _fallback_mem_store[key + '_' + activeYear];
      }
    }
    delete _fallback_mem_store[key];
    
    if (key === 'attendanceLogs') {
      const activeYear = localStorage.getItem('mss_activeAcademicYear');
      if (activeYear) {
        delete _fallback_mem_store['classAttendance_' + activeYear];
        delete _fallback_mem_store['busAttendance_' + activeYear];
      }
      delete _fallback_mem_store['classAttendance'];
      delete _fallback_mem_store['busAttendance'];
    }
  }
};

function getAvailableAcademicYears() {
  const years = new Set();
  
  // Load years from DB
  const dbYears = DB.get('academicYears') || [];
  dbYears.forEach(yr => {
    if (yr) years.add(yr);
  });

  // Load from sessionStorage / localStorage preference
  const activeYear = sessionStorage.getItem('mss_activeAcademicYear') || localStorage.getItem('mss_activeAcademicYear');
  if (activeYear) {
    years.add(activeYear);
  }
  
  // Load from student database entries
  const students = DB.get('students') || [];
  students.forEach(s => {
    const yr = s.academicYear || s.academic_year;
    if (yr) years.add(yr);
  });
  
  return Array.from(years).sort();
}

// ============================================
// SEED INITIAL DATA (if not already seeded)
// ============================================
function seedData() {
  // Always clean up old cached admin credentials in localStorage
  localStorage.removeItem('mss_admin');

  // Force-clear all cached data and local storage keys prefix 'mss_' once to give a fresh clean slate
  if (!localStorage.getItem('mss_clean_slate_v5')) {
    sessionStorage.clear();
    
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('mss_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    localStorage.setItem('mss_clean_slate_v5', 'true');
  }
}

// ============================================
// AUTHENTICATION
// ============================================
const Auth = {
  SESSION_KEY: 'mss_session',

  login(role, id, name) {
    const session = { role, id, name, loggedAt: new Date().toISOString() };
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
    return session;
  },

  logout() {
    sessionStorage.removeItem(this.SESSION_KEY);
  },

  getSession() {
    try { return JSON.parse(sessionStorage.getItem(this.SESSION_KEY)); }
    catch { return null; }
  },

  requireRole(role, redirectTo = 'index.html') {
    const s = this.getSession();
    if (!s || s.role !== role) {
      window.location.href = redirectTo;
      return false;
    }
    return s;
  },

  loginAdmin(username, password) {
    const cfg = (typeof window !== 'undefined' && window.MSS_CONFIG) || {};
    const adminUser = cfg.ADMIN_USERNAME || 'admin';
    const adminPass = cfg.ADMIN_PASSWORD || '';

    // If no admin password is set in Vercel, login is disabled.
    if (!adminPass) return null;

    if (adminUser.toLowerCase() === username.trim().toLowerCase()) {
      const inputHash = sha256(password);
      const expectedHash = sha256(adminPass);
      if (expectedHash === inputHash) {
        return this.login('admin', 'admin', 'Principal Admin');
      }
    }
    return null;
  },

  loginTeacher(username, password) {
    const teachers = DB.get('teachers') || [];
    const t = teachers.find(t => t.username.toLowerCase() === username.trim().toLowerCase());
    if (t) {
      const inputHash = sha256(password);
      if (t.password === inputHash) {
        return this.login('teacher', t.id, t.name);
      }
      if (t.password === password) {
        t.password = inputHash;
        DB.set('teachers', teachers);
        return this.login('teacher', t.id, t.name);
      }
    }
    return null;
  },

  loginStudent(rollNo, dob) {
    const students = DB.get('students') || [];
    // Support both camelCase (local/cached) and snake_case (Supabase raw rows)
    const s = students.find(s => {
      const roll = (s.rollNo || s.roll_no || '').trim();
      const birthDate = s.dob || null;
      return roll === rollNo.trim() && birthDate === dob;
    });
    if (s) {
      return this.login('student', s.id, s.name);
    }
    return null;
  },

  loginBus(busNumber, password) {
    const buses = DB.get('buses') || [];
    const b = buses.find(b => b.number === busNumber);
    if (b) {
      const expectedPassword = 'bus@' + b.number.replace(/\s+/g, '');
      if (password === expectedPassword) {
        return this.login('bus', b.id, 'Bus: ' + b.number);
      }
    }
    return null;
  }
};

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function showToast(message, type = 'info', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// ============================================
// NAVBAR BEHAVIOR
// ============================================
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');

  if (!navbar) return;

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 60);
  });

  if (toggle && links) {
    toggle.addEventListener('click', () => {
      links.classList.toggle('open');
      toggle.classList.toggle('active');
      toggle.setAttribute('aria-expanded', links.classList.contains('open') ? 'true' : 'false');
    });
    // Close on link click
    links.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        links.classList.remove('open');
        toggle.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Active link
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href')?.split('/').pop();
    if (href === path) a.classList.add('active');
  });
}

// ============================================
// ATTENDANCE HELPERS
// ============================================
const Attendance = {
  markClass(studentId, date, present) {
    const logs = DB.get('attendanceLogs') || [];
    const existing = logs.find(l => l.studentId === studentId && l.date === date && l.type === 'class');
    if (existing) {
      existing.present = present;
    } else {
      logs.push({ studentId, date, type: 'class', present });
    }
    DB.set('attendanceLogs', logs);
  },

  markBus(studentId, date, present, shift = 'morning') {
    const logs = DB.get('attendanceLogs') || [];
    const logType = `bus-${shift}`;
    const existing = logs.find(l => l.studentId === studentId && l.date === date && l.type === logType);
    if (existing) {
      existing.present = present;
    } else {
      logs.push({ studentId, date, type: logType, present });
    }
    DB.set('attendanceLogs', logs);
  },

  getStudentAttendance(studentId, date) {
    const logs = DB.get('attendanceLogs') || [];
    const today = logs.filter(l => l.studentId === studentId && l.date === date);
    return {
      class: today.find(l => l.type === 'class'),
      bus: today.find(l => l.type === 'bus' || l.type === 'bus-morning' || l.type === 'bus-evening'),
      busMorning: today.find(l => l.type === 'bus-morning'),
      busEvening: today.find(l => l.type === 'bus-evening'),
    };
  },

  getBulkForDate(date, type = 'class') {
    const logs = DB.get('attendanceLogs') || [];
    return logs.filter(l => l.date === date && l.type === type);
  }
};

// ============================================
// ID GENERATOR
// ============================================
function genId(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// ============================================
// DATE UTILS
// ============================================
function today() {
  return new Date().toISOString().split('T')[0];
}
function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function currentMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function currentAcademicYear() {
  const customYear = sessionStorage.getItem('mss_activeAcademicYear') || localStorage.getItem('mss_activeAcademicYear');
  if (customYear) return customYear;
  return ''; // Forced setup: return empty so the user must create/select one first.
}

// Signal that student data is ready after Supabase pull (used by student-login.html)
window._mssStudentDataReady = false;
window.addEventListener('mss-db-sync', () => {
  window._mssStudentDataReady = true;
});
// Also mark ready if Supabase is not configured (local-only mode)
if (typeof isSupabaseConfigured === 'function' && !isSupabaseConfigured()) {
  window._mssStudentDataReady = true;
}

// Duplicate submission prevention helper
function preventDoubleSubmit(e) {
  if (!e || !e.target) return false;
  const form = e.target;
  if (form.dataset.submitting === 'true') {
    e.preventDefault();
    e.stopPropagation();
    return true; // was double submit
  }
  form.dataset.submitting = 'true';
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    form.dataset.originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:0.4rem;"><span class="mss-spinner" style="width:14px;height:14px;border-width:2px;margin:0;"></span> Saving...</span>';
  }
  return false; // first submission
}

function releaseDoubleSubmit(form) {
  if (!form) return;
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn && form.dataset.originalBtnText !== undefined) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = form.dataset.originalBtnText;
  }
  delete form.dataset.submitting;
  delete form.dataset.originalBtnText;
}

window.preventDoubleSubmit = preventDoubleSubmit;
window.releaseDoubleSubmit = releaseDoubleSubmit;

document.addEventListener('DOMContentLoaded', () => {
  seedData();
  initNavbar();
});
