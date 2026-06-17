/**
 * MSS SCHOOL - Demonstration Data File
 * Used to seed realistic data for evaluation and testing.
 * Will be skipped when Supabase database is connected or when disabled.
 */

const DemoData = {
  // Class attendance present counts out of 220
  classAttendance: {
    's1': { year: '2024-25', presentCount: 188 },
    's2': { year: '2024-25', presentCount: 201 },
    's3': { year: '2024-25', presentCount: 172 },
    's4': { year: '2024-25', presentCount: 195 },
    's5': { year: '2024-25', presentCount: 190 },
    's6': { year: '2024-25', presentCount: 165 },
    's7': { year: '2024-25', presentCount: 208 }
  },

  // Bus attendance trips count for complete academic year
  getBusAttendance() {
    // Determine the active academic year start year
    const customYear = localStorage.getItem('mss_activeAcademicYear');
    let activeYear = customYear;
    if (!activeYear) {
      const y = new Date().getFullYear();
      const m = new Date().getMonth() + 1;
      if (m >= 6) activeYear = `${y}-${(y + 1).toString().substr(2)}`;
      else activeYear = `${y - 1}-${y.toString().substr(2)}`;
    }
    const startYearStr = activeYear.split('-')[0];
    const startYear = parseInt(startYearStr, 10);
    
    // Build array of YYYY-MM months for the academic year (June to May)
    const months = [];
    for (let m = 6; m <= 12; m++) {
      months.push(`${startYear}-${String(m).padStart(2, '0')}`);
    }
    for (let m = 1; m <= 5; m++) {
      months.push(`${startYear + 1}-${String(m).padStart(2, '0')}`);
    }

    // Helper to generate realistic counts for academic months
    const makeStudentData = (baseCount) => {
      const data = {};
      months.forEach(m => {
        const monthNum = parseInt(m.split('-')[1], 10);
        if (monthNum === 5) {
          // May: Summer holidays
          data[m] = 0;
        } else if (monthNum === 6) {
          // June: Reopening
          data[m] = Math.floor(baseCount / 2);
        } else {
          // Normal month: slightly random around base count
          data[m] = Math.max(0, baseCount + Math.floor(Math.random() * 9) - 4);
        }
      });
      return data;
    };

    return {
      's1': makeStudentData(38),
      's2': {},
      's3': makeStudentData(35),
      's4': {},
      's5': makeStudentData(41),
      's6': makeStudentData(32),
      's7': {}
    };
  },

  // Exam marks per student
  marks: {
    's1': {
      'Tamil': { exam1: 88, exam2: 82, exam3: 91 },
      'English': { exam1: 92, exam2: 89, exam3: 94 },
      'Mathematics': { exam1: 98, exam2: 95, exam3: 99 },
      'Science': { exam1: 85, exam2: 90, exam3: 93 },
      'Social Science': { exam1: 80, exam2: 85, exam3: 88 },
      'Computer Science': { exam1: 95, exam2: 97, exam3: 100 }
    },
    's3': {
      'Tamil': { exam1: 72, exam2: 75, exam3: 78 },
      'English': { exam1: 80, exam2: 82, exam3: 85 },
      'Mathematics': { exam1: 65, exam2: 70, exam3: 74 },
      'Science': { exam1: 81, exam2: 80, exam3: 84 },
      'Social Science': { exam1: 78, exam2: 76, exam3: 80 },
      'Computer Science': { exam1: 88, exam2: 90, exam3: 92 }
    },
    's5': {
      'Tamil': { exam1: 85, exam2: 87, exam3: 89 },
      'English': { exam1: 88, exam2: 86, exam3: 90 },
      'Mathematics': { exam1: 90, exam2: 92, exam3: 95 },
      'Science': { exam1: 94, exam2: 93, exam3: 96 },
      'Social Science': { exam1: 89, exam2: 91, exam3: 92 },
      'Computer Science': { exam1: 96, exam2: 98, exam3: 99 }
    },
    's6': {
      'Tamil': { exam1: 62, exam2: 68, exam3: 70 },
      'English': { exam1: 70, exam2: 72, exam3: 75 },
      'Mathematics': { exam1: 58, exam2: 64, exam3: 67 },
      'Science': { exam1: 69, exam2: 71, exam3: 74 },
      'Social Science': { exam1: 73, exam2: 75, exam3: 78 },
      'Computer Science': { exam1: 80, exam2: 82, exam3: 85 }
    }
  },

  // Attendance tracking logs for today
  getAttendanceLogs(todayStr) {
    return [
      // s1 (Arjun Kumar - Bus student)
      { id: 'l1_m', studentId: 's1', date: todayStr, type: 'bus-morning', present: true },
      { id: 'l1_c', studentId: 's1', date: todayStr, type: 'class', present: true },
      { id: 'l1_e', studentId: 's1', date: todayStr, type: 'bus-evening', present: true },

      // s2 (Priya Sharma - Day Scholar)
      { id: 'l2_c', studentId: 's2', date: todayStr, type: 'class', present: true },

      // s3 (Mohammed Iqbal - Bus student)
      { id: 'l3_m', studentId: 's3', date: todayStr, type: 'bus-morning', present: true },
      { id: 'l3_c', studentId: 's3', date: todayStr, type: 'class', present: true },

      // s4 (Ananya Devi - Day Scholar)
      { id: 'l4_c', studentId: 's4', date: todayStr, type: 'class', present: true },

      // s5 (Ravi Shankar - Bus student - Missed class, boarded morning bus)
      { id: 'l5_m', studentId: 's5', date: todayStr, type: 'bus-morning', present: true },
      { id: 'l5_c', studentId: 's5', date: todayStr, type: 'class', present: false },

      // s6 (Suresh Raj - Bus student - Missed morning bus, present in class)
      { id: 'l6_m', studentId: 's6', date: todayStr, type: 'bus-morning', present: false },
      { id: 'l6_c', studentId: 's6', date: todayStr, type: 'class', present: true },

      // s7 (Kavya Lakshmi - Day Scholar - Absent)
      { id: 'l7_c', studentId: 's7', date: todayStr, type: 'class', present: false }
    ];
  }
};

// Force re-seed to align flat attendance logs schema update
if (localStorage.getItem('mss_demoSeeded_v3') !== 'true') {
  localStorage.removeItem('mss_seeded');
  localStorage.removeItem('mss_demoSeeded');
  localStorage.setItem('mss_demoSeeded_v3', 'true');
}
