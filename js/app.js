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
var DB = window.DB || {
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

function getAvailableAcademicYears() {
  const years = new Set();
  const activeYear = localStorage.getItem('mss_activeAcademicYear');
  if (activeYear) {
    years.add(activeYear);
  }
  
  const y = new Date().getFullYear();
  const m = new Date().getMonth() + 1;
  const currentDefault = (m >= 6) ? `${y}-${(y + 1).toString().substr(2)}` : `${y - 1}-${y.toString().substr(2)}`;
  years.add(currentDefault);
  years.add('2024-25');
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('mss_students_')) {
      const year = key.replace('mss_students_', '');
      if (year && year !== 'null' && year !== 'undefined') {
        years.add(year);
      }
    }
  }
  return Array.from(years).sort();
}

// ============================================
// SEED INITIAL DATA (if not already seeded)
// ============================================
function seedData() {
  if (DB.get('seeded_v3_prod')) return;

  // Clear any legacy fake data from previous versions
  sessionStorage.clear();

  // Admin credentials loaded from Vercel env vars (via window.MSS_CONFIG → js/config.js)
  const cfg = (typeof window !== 'undefined' && window.MSS_CONFIG) || {};
  const adminUser = cfg.ADMIN_USERNAME || 'admin';
  const adminPass = cfg.ADMIN_PASSWORD || '';
  if (adminPass) {
    DB.set('admin', { username: adminUser, password: sha256(adminPass), name: 'Principal Admin' });
  }

  // All school data starts empty. Admin adds everything through the dashboard.
  DB.set('seeded_v3_prod', true);
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
    const admin = DB.get('admin');
    if (admin && admin.username.toLowerCase() === username.trim().toLowerCase()) {
      const inputHash = sha256(password);
      if (admin.password === inputHash) {
        return this.login('admin', 'admin', admin.name);
      }
      if (admin.password === password) {
        admin.password = inputHash;
        DB.set('admin', admin);
        return this.login('admin', 'admin', admin.name);
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
    const s = students.find(s => s.rollNo.trim() === rollNo.trim() && s.dob === dob);
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
    });
    // Close on link click
    links.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        links.classList.remove('open');
        toggle.classList.remove('active');
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

    // Update count
    if (present) {
      const att = DB.get('classAttendance') || {};
      if (!att[studentId]) att[studentId] = { year: '2024-25', presentCount: 0 };
      // Only count if not already marked present today
      const prevRecord = logs.find(l => l.studentId === studentId && l.date === date && l.type === 'class');
      att[studentId].presentCount = (att[studentId].presentCount || 0) + (prevRecord && prevRecord.present ? 0 : 1);
      DB.set('classAttendance', att);
    }
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

    if (present) {
      const ba = DB.get('busAttendance') || {};
      const month = date.substring(0, 7); // YYYY-MM
      if (!ba[studentId]) ba[studentId] = {};
      if (!ba[studentId][month]) ba[studentId][month] = 0;
      // Avoid double counting
      const alreadyCounted = logs.filter(l => l.studentId === studentId && l.date === date && l.type === logType && l.present);
      if (alreadyCounted.length <= 1) {
        ba[studentId][month]++;
      }
      DB.set('busAttendance', ba);
    }
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
  const customYear = localStorage.getItem('mss_activeAcademicYear');
  if (customYear) return customYear;
  
  const y = new Date().getFullYear();
  const m = new Date().getMonth() + 1;
  if (m >= 6) return `${y}-${(y + 1).toString().substr(2)}`;
  return `${y - 1}-${y.toString().substr(2)}`;
}

document.addEventListener('DOMContentLoaded', () => {
  seedData();
  initNavbar();
});
