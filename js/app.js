/* ============================================
   MSS SCHOOL - Core Application Logic
   Uses localStorage for all data storage
   ============================================ */

'use strict';

// ============================================
// DATA LAYER
// ============================================
var DB = window.DB || {
  get(key) {
    try { return JSON.parse(localStorage.getItem('mss_' + key)) || null; }
    catch { return null; }
  },
  set(key, value) {
    localStorage.setItem('mss_' + key, JSON.stringify(value));
  },
  remove(key) { localStorage.removeItem('mss_' + key); }
};

// ============================================
// SEED INITIAL DATA (if not already seeded)
// ============================================
function seedData() {
  if (DB.get('seeded') && DB.get('demoSeeded') && DB.get('marks') && DB.get('subjects') && DB.get('students')) return;

  // Admin credentials
  DB.set('admin', { username: 'admin', password: 'mss@admin2024', name: 'Principal Admin' });

  // Classes
  DB.set('classes', [
    { id: 'c1', name: 'Class 1 - A', section: 'A', grade: 1 },
    { id: 'c2', name: 'Class 2 - A', section: 'A', grade: 2 },
    { id: 'c3', name: 'Class 3 - A', section: 'A', grade: 3 },
    { id: 'c4', name: 'Class 4 - A', section: 'A', grade: 4 },
    { id: 'c5', name: 'Class 5 - A', section: 'A', grade: 5 },
    { id: 'c6', name: 'Class 6 - A', section: 'A', grade: 6 },
    { id: 'c7', name: 'Class 7 - A', section: 'A', grade: 7 },
    { id: 'c8', name: 'Class 8 - A', section: 'A', grade: 8 },
    { id: 'c9', name: 'Class 9 - A', section: 'A', grade: 9 },
    { id: 'c10', name: 'Class 10 - A', section: 'A', grade: 10 },
  ]);

  // Teachers
  DB.set('teachers', [
    { id: 't1', name: 'Mrs. Kavitha', username: 'kavitha', password: 'teacher@123', classId: 'c5', phone: '9442791922', email: 'kavitha@mss.edu' },
    { id: 't2', name: 'Mr. Rajan', username: 'rajan', password: 'teacher@123', classId: 'c8', phone: '9876543210', email: 'rajan@mss.edu' },
  ]);

  // Buses
  DB.set('buses', [
    { id: 'b1', number: 'TN 43 A 1234', route: 'Uppatty - School Route 1', driver: 'Mr. Kumar', phone: '9876512345', capacity: 40 },
    { id: 'b2', number: 'TN 43 B 5678', route: 'Pandalur - School Route 2', driver: 'Mr. Siva', phone: '9765432100', capacity: 40 },
  ]);

  // Students (sample)
  DB.set('students', [
    { id: 's1', rollNo: '001', name: 'Arjun Kumar', dob: '2015-06-15', classId: 'c5', type: 'bus', busId: 'b1', phone: '9876543210', parentName: 'Mr. Kumar', academicYear: '2024-25' },
    { id: 's2', rollNo: '002', name: 'Priya Sharma', dob: '2015-03-22', classId: 'c5', type: 'dayscholar', busId: null, phone: '9765432109', parentName: 'Mr. Sharma', academicYear: '2024-25' },
    { id: 's3', rollNo: '003', name: 'Mohammed Iqbal', dob: '2015-09-10', classId: 'c5', type: 'bus', busId: 'b1', phone: '9654321098', parentName: 'Mr. Iqbal', academicYear: '2024-25' },
    { id: 's4', rollNo: '004', name: 'Ananya Devi', dob: '2015-11-30', classId: 'c5', type: 'dayscholar', busId: null, phone: '9543210987', parentName: 'Mrs. Devi', academicYear: '2024-25' },
    { id: 's5', rollNo: '005', name: 'Ravi Shankar', dob: '2015-04-18', classId: 'c5', type: 'bus', busId: 'b2', phone: '9432109876', parentName: 'Mr. Shankar', academicYear: '2024-25' },
    { id: 's6', rollNo: '201', name: 'Suresh Raj', dob: '2012-07-25', classId: 'c8', type: 'bus', busId: 'b1', phone: '9321098765', parentName: 'Mr. Raj', academicYear: '2024-25' },
    { id: 's7', rollNo: '202', name: 'Kavya Lakshmi', dob: '2012-01-14', classId: 'c8', type: 'dayscholar', busId: null, phone: '9210987654', parentName: 'Mrs. Lakshmi', academicYear: '2024-25' },
  ]);

  // Subjects per class
  DB.set('subjects', {
    'c5': ['Tamil', 'English', 'Mathematics', 'Science', 'Social Science', 'Computer Science'],
    'c8': ['Tamil', 'English', 'Mathematics', 'Science', 'Social Science', 'Computer Science'],
  });

  // Attendance: classAttendance[studentId] = { year: '2024-25', presentCount: 0 }
  const hasDemo = typeof DemoData !== 'undefined';
  DB.set('classAttendance', hasDemo ? DemoData.classAttendance : {});

  // Bus Attendance: busAttendance[studentId][YYYY-MM] = count
  const month = currentMonth();
  DB.set('busAttendance', hasDemo ? DemoData.getBusAttendance(month) : {});

  // Marks: marks[studentId][subject] = { exam1, exam2, ... }
  DB.set('marks', hasDemo ? DemoData.marks : {});

  // Daily attendance records for admin visibility
  const dToday = today();
  DB.set('attendanceLogs', hasDemo ? DemoData.getAttendanceLogs(dToday) : []);

  DB.set('seeded', true);
  DB.set('demoSeeded', true);
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
    const admin = DB.get('admin') || { username: 'admin', password: 'mss@admin2024', name: 'Principal Admin' };
    if (admin && admin.username.toLowerCase() === username.trim().toLowerCase() && admin.password === password) {
      return this.login('admin', 'admin', admin.name);
    }
    return null;
  },

  loginTeacher(username, password) {
    const teachers = DB.get('teachers') || [];
    const t = teachers.find(t => t.username.toLowerCase() === username.trim().toLowerCase() && t.password === password);
    if (t) {
      return this.login('teacher', t.id, t.name);
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

// ============================================
// INIT ON LOAD
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  seedData();
  
  // Ensure demo attendanceLogs are always updated to today's date
  const logs = DB.get('attendanceLogs') || [];
  const currentToday = today();
  if (logs.length === 0 || logs[0].date !== currentToday) {
    if (typeof DemoData !== 'undefined') {
      DB.set('attendanceLogs', DemoData.getAttendanceLogs(currentToday));
    }
  }

  initNavbar();
});
