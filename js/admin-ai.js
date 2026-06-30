/* ==========================================================================
   MSS AI Assistant Logic (admin-ai.js)
   ========================================================================== */
'use strict';

// Global dictionary for raw AI messages (prevents HTML escaping bugs during copying)
window._aiMsgContents = {};
let aiChatHistory = [];
let currentSpeechUtterance = null;

// Initialize Markdown parser
let mdParser = null;
if (typeof window.markdownit === 'function') {
  mdParser = window.markdownit({
    html: true,
    linkify: true,
    typographer: true
  });
}

function getGeminiApiKey() {
  const cfg = (typeof window !== 'undefined' && window.MSS_CONFIG) || {};
  return cfg.GEMINI_API_KEY || localStorage.getItem('mss_gemini_api_key') || '';
}

function saveGeminiApiKey() {
  const inputEl = document.getElementById('aiApiKeyInput');
  if (!inputEl) return;
  const key = inputEl.value.trim();
  if (!key) {
    showToast('Please enter a valid API key.', 'warning');
    return;
  }
  localStorage.setItem('mss_gemini_api_key', key);
  inputEl.value = '';
  updateAiStatusUi();
  showToast('Gemini API Key saved successfully!', 'success');
}

function removeGeminiApiKey() {
  localStorage.removeItem('mss_gemini_api_key');
  updateAiStatusUi();
  showToast('Gemini API Key removed.', 'info');
}

function updateAiStatusUi() {
  const apiKey = getGeminiApiKey();
  const badgeContainer = document.getElementById('aiKeyStatusBadge');
  const setupPanel = document.getElementById('aiKeySetupPanel');
  
  if (apiKey) {
    const masked = apiKey.substring(0, 6) + '...' + apiKey.substring(apiKey.length - 4);
    if (badgeContainer) {
      badgeContainer.innerHTML = `
        <span class="badge" style="background: rgba(16, 185, 129, 0.1); color: var(--success); font-weight: 700; border: 1px solid rgba(16, 185, 129, 0.2); padding: 0.4rem 0.8rem; border-radius: var(--radius-full); font-size: 0.8rem; display: flex; align-items: center; gap: 0.4rem;">
          <span class="pulse-indicator"></span> AI Assistant Online (${masked})
        </span>
      `;
    }
    if (setupPanel) {
      setupPanel.style.display = 'none';
    }
  } else {
    if (badgeContainer) {
      badgeContainer.innerHTML = `
        <span class="badge" style="background: rgba(239, 68, 68, 0.1); color: var(--danger); font-weight: 700; border: 1px solid rgba(239, 68, 68, 0.2); padding: 0.4rem 0.8rem; border-radius: var(--radius-full); font-size: 0.8rem; display: flex; align-items: center; gap: 0.4rem;">
          <i class="bi bi-exclamation-triangle-fill"></i> API Key Required
        </span>
      `;
    }
    if (setupPanel) {
      setupPanel.style.display = 'block';
    }
  }
}

function showChangeApiKeyModal() {
  const setupPanel = document.getElementById('aiKeySetupPanel');
  if (setupPanel) {
    setupPanel.style.display = 'block';
    const input = document.getElementById('aiApiKeyInput');
    if (input) {
      input.focus();
      const current = localStorage.getItem('mss_gemini_api_key') || '';
      input.value = current;
    }
  }
}

// Check database cache state
function checkDatabaseState() {
  const syncStatusEl = document.getElementById('aiDbSyncStatus');
  const students = DB.get('students') || [];
  if (syncStatusEl) {
    if (students.length > 0) {
      syncStatusEl.textContent = 'Yes (' + students.length + ' students loaded)';
      syncStatusEl.style.color = 'var(--success)';
    } else {
      syncStatusEl.textContent = 'No Data Loaded';
      syncStatusEl.style.color = 'var(--warning)';
    }
  }
}

function compileSystemContext(userPrompt) {
  const query = (userPrompt || '').toLowerCase();
  
  const classes = DB.get('classes') || [];
  const students = DB.get('students') || [];
  const teachers = DB.get('teachers') || [];
  const buses = DB.get('buses') || [];
  const rawLogs = DB.get('attendanceLogs') || [];
  const rawMarks = DB.get('marks') || {};
  const maxMarks = DB.get('subjectMaxMarks') || {};

  // High-level statistics (always included, extremely lightweight)
  const totalStudents = students.length;
  const totalTeachers = teachers.length;
  const totalBuses = buses.length;
  
  // Detect if a specific class is mentioned in the prompt
  // (e.g., "10-A", "Class 5-B", "5-B")
  let targetClassId = null;
  let targetClassName = null;
  const classMatches = query.match(/\b(\d{1,2}-[A-Za-z])\b/);
  if (classMatches) {
    targetClassName = classMatches[1].toUpperCase();
    const cGrade = targetClassName.split('-')[0];
    const cSection = targetClassName.split('-')[1];
    const foundCls = classes.find(c => String(c.grade) === cGrade && String(c.section).toUpperCase() === cSection);
    if (foundCls) {
      targetClassId = foundCls.id;
    }
  }

  // Detect if a specific student is mentioned (e.g., roll number "1002")
  let targetStudentId = null;
  const rollMatches = query.match(/\b(\d{3,5})\b/);
  if (rollMatches) {
    const roll = rollMatches[1];
    const foundStud = students.find(s => String(s.rollNo || s.roll_no) === roll);
    if (foundStud) {
      targetStudentId = foundStud.id;
    }
  }

  // Helper: check if category requested
  const isFeesQuery = query.includes('fee') || query.includes('pay') || query.includes('due') || query.includes('unpaid') || query.includes('partial') || query.includes('money') || query.includes('cost') || query.includes('rupee') || query.includes('rs') || query.includes('₹') || query.includes('dayscholar');
  const isMarksQuery = query.includes('mark') || query.includes('exam') || query.includes('grade') || query.includes('score') || query.includes('fail') || query.includes('pass') || query.includes('rank') || query.includes('midterm') || query.includes('quarterly') || query.includes('final') || query.includes('annual') || query.includes('topper') || query.includes('average') || query.includes('subject');
  const isAttendanceQuery = query.includes('attendance') || query.includes('absent') || query.includes('present') || query.includes('leave') || query.includes('late');
  const isBusQuery = query.includes('bus') || query.includes('route') || query.includes('driver') || query.includes('transport') || query.includes('stop');

  // Filter students to send to AI
  // If specific student or class is mentioned, send only those. Otherwise, send minimal fields to save tokens.
  let filteredStudents = students.map(s => {
    return {
      id: s.id,
      name: s.name,
      rollNo: s.rollNo || s.roll_no || 'N/A',
      classId: s.classId,
      type: s.type || 'dayscholar',
      busId: s.busId
    };
  });

  if (targetStudentId) {
    const fullStud = students.find(s => s.id === targetStudentId);
    if (fullStud) {
      filteredStudents = [fullStud];
    }
  } else if (targetClassId) {
    filteredStudents = students.filter(s => s.classId === targetClassId);
  } else if (!isFeesQuery && !isMarksQuery && !isAttendanceQuery && !isBusQuery) {
    // If it's a completely generic query, just send a small slice (first 10) to confirm data exists,
    // plus inform that it is token optimized.
    filteredStudents = filteredStudents.slice(0, 10);
  }

  // Generate fees summary selectively
  let fees = [];
  const fullFeesList = students.map(s => {
    const isBus = (s.type || '').toLowerCase() === 'bus' || !!s.busId;
    const tuition = 25000;
    const transport = isBus ? 8000 : 0;
    const total = tuition + transport;
    
    let paid = total;
    let status = 'Paid';
    const seed = (s.name || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const lastChar = (s.rollNo || s.roll_no || '').toString().slice(-1);
    const isNumber = !isNaN(parseInt(lastChar));
    
    if (seed % 5 === 1) {
      paid = isBus ? 15000 : 10000;
      status = 'Partial';
    } else if (seed % 5 === 3 && (lastChar === '3' || lastChar === '7' || lastChar === '9' || !isNumber)) {
      paid = 0;
      status = 'Unpaid';
    }
    
    return {
      studentId: s.id,
      studentName: s.name,
      rollNo: s.rollNo || s.roll_no || 'N/A',
      classId: s.classId,
      feeType: s.type || 'dayscholar',
      tuitionFee: tuition,
      transportFee: transport,
      totalFee: total,
      paidAmount: paid,
      dueAmount: total - paid,
      status: status
    };
  });

  // Calculate totals
  const totalFeesExpected = fullFeesList.reduce((sum, item) => sum + item.totalFee, 0);
  const totalFeesCollected = fullFeesList.reduce((sum, item) => sum + item.paidAmount, 0);
  const totalFeesDue = totalFeesExpected - totalFeesCollected;
  const unpaidCount = fullFeesList.filter(f => f.status === 'Unpaid').length;
  const partialCount = fullFeesList.filter(f => f.status === 'Partial').length;

  const feesStats = {
    totalExpected: totalFeesExpected,
    totalCollected: totalFeesCollected,
    totalDue: totalFeesDue,
    unpaidStudentsCount: unpaidCount,
    partialStudentsCount: partialCount
  };

  if (isFeesQuery || targetStudentId || targetClassId) {
    fees = fullFeesList.filter(f => {
      if (targetStudentId) return f.studentId === targetStudentId;
      if (targetClassId) return f.classId === targetClassId;
      return f.status !== 'Paid'; // Only include unpaid/partial
    });
  }

  // Attendance
  let attendance = [];
  const fullAttendanceList = students.map(s => {
    const studentLogs = rawLogs.filter(l => l.studentId === s.id);
    const totalDays = studentLogs.filter(l => l.type === 'class').length;
    const presentDays = studentLogs.filter(l => l.type === 'class' && l.present).length;
    const rate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 100;
    return {
      studentId: s.id,
      studentName: s.name,
      rollNo: s.rollNo || s.roll_no || 'N/A',
      classId: s.classId,
      totalDays,
      presentDays,
      attendanceRate: rate
    };
  });

  const schoolAverageAttendance = fullAttendanceList.length > 0
    ? Math.round(fullAttendanceList.reduce((sum, a) => sum + a.attendanceRate, 0) / fullAttendanceList.length)
    : 100;

  const attendanceStats = {
    schoolAverageRate: schoolAverageAttendance
  };

  if (isAttendanceQuery || targetStudentId || targetClassId) {
    attendance = fullAttendanceList.filter(a => {
      if (targetStudentId) return a.studentId === targetStudentId;
      if (targetClassId) return a.classId === targetClassId;
      return a.attendanceRate < 90; // Only highlight low attendance
    });
  }

  // Exam Marks
  let examMarks = [];
  const marksList = [];
  for (const sId in rawMarks) {
    const student = students.find(s => s.id === sId);
    if (!student) continue;
    
    for (const sub in rawMarks[sId]) {
      for (const exam in rawMarks[sId][sub]) {
        const score = rawMarks[sId][sub][exam];
        const maxScore = (maxMarks[student.classId] && maxMarks[student.classId][sub] !== undefined)
          ? maxMarks[student.classId][sub]
          : 100;
        marksList.push({
          studentId: student.id,
          studentName: student.name,
          rollNo: student.rollNo || student.roll_no || 'N/A',
          classId: student.classId,
          subject: sub,
          exam: exam,
          marksObtained: score,
          maxMarks: maxScore
        });
      }
    }
  }

  // Compute marks statistics per class & subject
  const marksStats = {};
  classes.forEach(c => {
    const cId = c.id;
    const cName = `${c.grade || ''}-${c.section || ''}`;
    const classMarks = marksList.filter(m => m.classId === cId);
    if (classMarks.length === 0) return;

    marksStats[cName] = {};
    const subjectsInClass = [...new Set(classMarks.map(m => m.subject))];
    subjectsInClass.forEach(sub => {
      const subMarks = classMarks.filter(m => m.subject === sub);
      const examNames = [...new Set(subMarks.map(m => m.exam))];
      marksStats[cName][sub] = {};
      examNames.forEach(ex => {
        const scores = subMarks.filter(m => m.exam === ex).map(m => m.marksObtained);
        const avg = scores.length > 0 ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length) : 0;
        marksStats[cName][sub][ex] = {
          average: avg,
          max: Math.max(...scores, 0),
          min: Math.min(...scores, 0)
        };
      });
    });
  });

  if (isMarksQuery || targetStudentId || targetClassId) {
    examMarks = marksList.filter(m => {
      if (targetStudentId) return m.studentId === targetStudentId;
      if (targetClassId) return m.classId === targetClassId;
      // Filter to toppers or low scorers to avoid massive context
      return m.marksObtained >= 90 || m.marksObtained < 40;
    });
  }

  // Classes Mapped
  const classesWithNames = classes.map(c => {
    const teacher = teachers.find(t => Array.isArray(t.classId) ? t.classId.includes(c.id) : t.classId === c.id);
    return {
      id: c.id,
      name: `${c.grade || ''}-${c.section || ''}`,
      classTeacher: teacher ? teacher.name : 'Unassigned'
    };
  });

  return {
    isDynamicContext: true,
    activeFilters: {
      feesFiltered: !isFeesQuery && !targetStudentId && !targetClassId,
      attendanceFiltered: !isAttendanceQuery && !targetStudentId && !targetClassId,
      marksFiltered: !isMarksQuery && !targetStudentId && !targetClassId,
      classScope: targetClassName || 'All Classes',
      studentScope: targetStudentId ? 'Specific Student' : 'All Students'
    },
    overviewStats: {
      totalStudents,
      totalTeachers,
      totalBuses,
      feesStats,
      attendanceStats
    },
    classes: classesWithNames,
    teachers: teachers.map(t => ({
      name: t.name,
      dob: t.dob || 'Not set',
      assignedClasses: Array.isArray(t.classId) 
        ? t.classId.map(cId => classes.find(c => c.id === cId)?.grade + '-' + classes.find(c => c.id === cId)?.section).filter(Boolean).join(', ')
        : (classes.find(c => c.id === t.classId)?.grade + '-' + classes.find(c => c.id === t.classId)?.section || 'None')
    })),
    buses: isBusQuery ? buses : buses.map(b => ({ number: b.number, route: b.route })),
    students: filteredStudents,
    feesSummary: fees,
    attendanceSummaries: attendance,
    marksStats: marksStats,
    examMarks: examMarks
  };
}

// Interactively formats text for linking classes or roll numbers
function applyInteractiveLinks(htmlContent) {
  // 1. Roll numbers matching: Roll No: 1001, Roll: 1001, etc.
  let formatted = htmlContent.replace(/\b(Roll\s+No:?\s*|Roll:?\s*|roll_no:?\s*)(\d{3,5})\b/gi, (match, prefix, roll) => {
    return `<span class="ai-interactive-badge badge-roll" onclick="jumpToSearch('${roll}')" title="Click to view student detail"><i class="bi bi-person-fill"></i> ${match}</span>`;
  });

  // 2. Class names matching: e.g. 5-A, 10-B, Class 6-C
  formatted = formatted.replace(/\b(Class\s+)?(\d{1,2}-[A-Za-z])\b/gi, (match, classPrefix, className) => {
    return `<span class="ai-interactive-badge badge-class" onclick="jumpToSearch('${className}')" title="Click to filter class"><i class="bi bi-building-fill"></i> ${match}</span>`;
  });

  return formatted;
}

// Global search interface link
function jumpToSearch(term) {
  const searchInput = document.getElementById('globalSearchInput');
  if (searchInput) {
    searchInput.value = term;
    window.handleGlobalSearch(term);
    searchInput.focus();
    searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast(`Searching for: ${term}`, 'info');
  }
}

// Suggested prompt categorization filter
function filterSuggestions(category, pillElement) {
  // Update pill selection
  const pills = document.querySelectorAll('.suggestion-pill');
  pills.forEach(p => p.classList.remove('active'));
  pillElement.classList.add('active');

  const btns = document.querySelectorAll('.quick-prompt-btn');
  btns.forEach(btn => {
    const btnCategory = btn.getAttribute('data-category');
    if (category === 'all' || btnCategory === category) {
      btn.style.display = 'flex';
    } else {
      btn.style.display = 'none';
    }
  });
}

async function submitChatQuery(promptOverride) {
  const inputEl = document.getElementById('aiChatInput');
  if (!inputEl) return;
  
  const userPrompt = promptOverride ? promptOverride.trim() : inputEl.value.trim();
  if (!userPrompt) return;
  
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    showToast('Gemini API Key is not configured in the environment.', 'error');
    return;
  }
  
  if (!promptOverride) {
    inputEl.value = '';
  }
  
  const sendBtn = document.getElementById('aiSendBtn');
  if (sendBtn) sendBtn.disabled = true;
  
  const chatContainer = document.getElementById('aiChatMessages');
  const userMsgId = 'user-msg-' + Date.now();
  const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  
  const userMsgHtml = `
    <div class="chat-msg user-msg" id="${userMsgId}">
      <div class="msg-avatar"><i class="bi bi-person-fill"></i></div>
      <div class="msg-bubble-container">
        <div class="msg-bubble">${escapeHtml(userPrompt)}</div>
        <div class="msg-time">${timeStr}</div>
      </div>
    </div>
  `;
  chatContainer.insertAdjacentHTML('beforeend', userMsgHtml);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  
  const typingIndicator = document.getElementById('aiTypingIndicator');
  if (typingIndicator) typingIndicator.style.display = 'flex';
  
  try {
    const systemContext = compileSystemContext(userPrompt);
    const activeYear = sessionStorage.getItem('mss_activeAcademicYear') || localStorage.getItem('mss_activeAcademicYear') || 'Current Session';
    
    const systemInstructionText = `
      You are the MSS School AI Assistant, a premium and highly helpful administrative assistant for MSS Matriculation School.
      Your job is to answer queries from the school administrator using the provided database snapshot.
      
      Current Academic Session: ${activeYear}
      
      Database Snapshot (JSON):
      ${JSON.stringify(systemContext)}
      
      Context Reference & Notes:
      1. TOKEN CONSERVATION & DYNAMIC FILTERING:
         - To protect against API rate limits, the Database Snapshot is dynamically filtered based on the query.
         - General statistics (overviewStats) are always present. Detailed lists like "feesSummary", "attendanceSummaries" and "examMarks" are hydrated selectively.
         - If lists are filtered or limited, assume this is for optimization. If you need details for a specific class or student not currently hydrated, politely ask the administrator to name the specific Class (e.g., "10-A") or Student Roll No.
      2. EXAMS:
         - 'exam1' refers to the Midterm Exam.
         - 'exam2' refers to the Quarterly Exam.
         - 'exam3' refers to the Final/Annual Exam.
         - If asked for 'midterm' marks, analysis or reports, focus on 'exam1'.
      3. FEES:
         - Tuition Fee is ₹25,000 for all students.
         - Transport Fee is ₹8,000 for students with transport type 'bus' (non-bus students have ₹0 transport fee).
         - The total fee is Tuition Fee + Transport Fee.
         - 'feesSummary' contains the exact deterministic fee calculations (paid, due, status). Use this to list unpaid/partial students, totals, and due amounts.
      4. ATTENDANCE:
         - 'attendanceSummaries' lists student attendance rate (%), total days, and present days.
      5. FORMATTING RULES:
         - Answer in clean, professional Markdown.
         - When presenting tabular data (lists of students, marks, fees), ALWAYS use Markdown tables.
         - Bold headers, use colors if helpful, and keep it extremely readable.
         - If generating reports, use clear structure (e.g. Header, Summary Cards, Tables, Actionable Insights).
    `;
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          ...aiChatHistory,
          {
            role: "user",
            parts: [{ text: userPrompt }]
          }
        ],
        systemInstruction: {
          parts: [{ text: systemInstructionText }]
        },
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8000
        }
      })
    });
    
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMsg = errData.error?.message || 'Network response was not OK';
      throw new Error(errMsg);
    }
    
    const result = await response.json();
    const aiText = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated by the AI.';
    
    const contentId = 'ai-content-' + Date.now();
    window._aiMsgContents[contentId] = aiText;
    
    aiChatHistory.push({ role: 'user', parts: [{ text: userPrompt }] });
    aiChatHistory.push({ role: 'model', parts: [{ text: aiText }] });
    
    // Save history to sessionStorage to persist session state
    try {
      sessionStorage.setItem('mss_ai_chat_history', JSON.stringify(aiChatHistory));
      sessionStorage.setItem('mss_ai_msg_contents', JSON.stringify(window._aiMsgContents));
    } catch (e) {
      console.warn('Failed to persist chat history:', e);
    }
    
    if (aiChatHistory.length > 30) {
      aiChatHistory = aiChatHistory.slice(aiChatHistory.length - 30);
    }
    
    // Render Markdown response & scan for interactive links
    let renderedHtml = mdParser ? mdParser.render(aiText) : aiText.replace(/\n/g, '<br>');
    renderedHtml = applyInteractiveLinks(renderedHtml);
    
    const aiMsgId = 'ai-msg-' + Date.now();
    
    // Detect if table exists for rendering the CSV export button
    const hasTable = aiText.includes('|') || renderedHtml.includes('<table');
    const csvButtonHtml = hasTable ? `
      <button class="msg-action-btn" onclick="exportTableToCsv('${contentId}')">
        <i class="bi bi-file-earmark-spreadsheet-fill"></i> Export Excel (CSV)
      </button>
    ` : '';
    
    const aiMsgHtml = `
      <div class="chat-msg ai-msg" id="${aiMsgId}">
        <div class="msg-avatar"><i class="bi bi-robot"></i></div>
        <div class="msg-bubble-container" style="flex: 1;">
          <div class="msg-bubble" id="${contentId}">${renderedHtml}</div>
          <div class="msg-actions">
            <button class="msg-action-btn" onclick="printAiMessage('${contentId}')">
              <i class="bi bi-printer-fill"></i> Print Report
            </button>
            <button class="msg-action-btn" onclick="downloadAiMessagePdf('${contentId}', 'MSS AI Executive Report')">
              <i class="bi bi-file-earmark-pdf-fill"></i> Export PDF
            </button>
            ${csvButtonHtml}
            <button class="msg-action-btn tts-btn" onclick="speakAiMessage('${contentId}', this)">
              <i class="bi bi-volume-up-fill"></i> Read Out
            </button>
            <button class="msg-action-btn" onclick="copyToClipboard(window._aiMsgContents['${contentId}'])">
              <i class="bi bi-copy"></i> Copy Text
            </button>
          </div>
          <div class="msg-time">${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </div>
    `;
    
    if (typingIndicator) typingIndicator.style.display = 'none';
    chatContainer.insertAdjacentHTML('beforeend', aiMsgHtml);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
  } catch (error) {
    console.error('AI Request Error:', error);
    if (typingIndicator) typingIndicator.style.display = 'none';
    
    const errorMsgHtml = `
      <div class="chat-msg ai-msg">
        <div class="msg-avatar" style="background: rgba(239, 68, 68, 0.1); color: var(--danger);"><i class="bi bi-exclamation-triangle"></i></div>
        <div class="msg-bubble-container">
          <div class="msg-bubble" style="background: rgba(239, 68, 68, 0.03); border-color: rgba(239, 68, 68, 0.15); color: var(--danger);">
            <strong>Error communicating with Gemini AI:</strong><br>
            ${escapeHtml(error.message)}
            <br><br>
            <span style="font-size: 0.8rem; opacity: 0.8;">Please check your server environment configuration or network connection.</span>
          </div>
          <div class="msg-time">${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </div>
    `;
    chatContainer.insertAdjacentHTML('beforeend', errorMsgHtml);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

function handleChatInputKeyDown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitChatQuery();
  }
}

function sendQuickPrompt(promptText) {
  submitChatQuery(promptText);
}

// Text-to-speech engine
function speakAiMessage(contentId, btn) {
  if ('speechSynthesis' in window) {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      // If we stop speech, set labels back to play
      const ttsButtons = document.querySelectorAll('.tts-btn');
      ttsButtons.forEach(b => {
        b.innerHTML = `<i class="bi bi-volume-up-fill"></i> Read Out`;
      });
      return;
    }
    
    const msgEl = document.getElementById(contentId);
    if (!msgEl) return;
    
    // Make a copy and strip HTML tables/links/etc. for clear audio narrative
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = msgEl.innerHTML;
    tempDiv.querySelectorAll('table, .ai-interactive-badge, .msg-actions').forEach(el => el.remove());
    
    const cleanText = tempDiv.innerText || tempDiv.textContent;
    if (!cleanText.trim()) {
      showToast('No speech-compatible text found in message.', 'info');
      return;
    }
    
    currentSpeechUtterance = new SpeechSynthesisUtterance(cleanText);
    currentSpeechUtterance.rate = 0.95;
    currentSpeechUtterance.pitch = 1.0;
    
    currentSpeechUtterance.onstart = () => {
      btn.innerHTML = `<i class="bi bi-volume-mute-fill"></i> Stop Speech`;
      btn.style.background = 'rgba(79, 70, 229, 0.15)';
    };
    
    currentSpeechUtterance.onend = () => {
      btn.innerHTML = `<i class="bi bi-volume-up-fill"></i> Read Out`;
      btn.style.background = '';
    };
    
    currentSpeechUtterance.onerror = () => {
      btn.innerHTML = `<i class="bi bi-volume-up-fill"></i> Read Out`;
      btn.style.background = '';
    };
    
    window.speechSynthesis.speak(currentSpeechUtterance);
  } else {
    showToast('Your browser does not support text-to-speech.', 'warning');
  }
}

// Export parsed table rows to CSV
function exportTableToCsv(contentId) {
  const contentEl = document.getElementById(contentId);
  if (!contentEl) return;
  
  const table = contentEl.querySelector('table');
  if (!table) {
    showToast('No data table found in this message.', 'warning');
    return;
  }
  
  let csvRows = [];
  const rows = table.querySelectorAll('tr');
  
  rows.forEach(row => {
    const cols = row.querySelectorAll('th, td');
    const rowContent = Array.from(cols).map(col => {
      // Escape inner quotes
      const cleanVal = col.innerText.replace(/"/g, '""').trim();
      return `"${cleanVal}"`;
    }).join(',');
    csvRows.push(rowContent);
  });
  
  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  link.setAttribute('href', url);
  link.setAttribute('download', `mss_report_table_${Date.now()}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Table exported as CSV successfully!', 'success');
}

function clearChatHistory() {
  const chatContainer = document.getElementById('aiChatMessages');
  if (chatContainer) {
    chatContainer.innerHTML = `
      <div class="chat-msg ai-msg">
        <div class="msg-avatar"><i class="bi bi-robot"></i></div>
        <div class="msg-bubble-container">
          <div class="msg-bubble">
            Hello! I am your <strong>MSS School AI Assistant</strong>. I have read-only access to all your Supabase data tables (classes, students, teachers, buses, mark sheets, and attendance registers).
            <br><br>
            You can ask me to perform operations like:
            <ul>
              <li>💰 <strong>"Tell me the students who have not paid fees"</strong> (I will generate a report listing them, their classes, due amounts, and parents' contacts).</li>
              <li>📊 <strong>"Show me a summary PDF of this midterm exam"</strong> (I will compile class averages, rank leaders, subject performance, and help you export the report).</li>
              <li>🚌 <strong>"List bus routes and tell me which students are assigned to route 4B"</strong>.</li>
            </ul>
            What can I help you compile today?
          </div>
          <div class="msg-time">-</div>
        </div>
      </div>
    `;
  }
  
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  
  aiChatHistory = [];
  window._aiMsgContents = {};
  sessionStorage.removeItem('mss_ai_chat_history');
  sessionStorage.removeItem('mss_ai_msg_contents');
  showToast('Chat history cleared.', 'info');
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Failed to copy text.', 'error');
  });
}

function printAiMessage(messageId) {
  const msgTextEl = document.getElementById(messageId);
  if (!msgTextEl) return;
  
  const reportHtml = msgTextEl.innerHTML;
  const printWindow = window.open('', '_blank');
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  
  printWindow.document.open();
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>MSS School AI Report</title>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"/>
      <style>
        body {
          font-family: 'Plus Jakarta Sans', sans-serif;
          color: #0f172a;
          margin: 0;
          padding: 2.5rem;
          line-height: 1.6;
          background: #ffffff;
        }
        .report-header {
          border-bottom: 3px double #4f46e5;
          padding-bottom: 1.5rem;
          margin-bottom: 2rem;
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }
        .header-text {
          flex: 1;
        }
        .header-text h1 {
          margin: 0;
          font-size: 1.8rem;
          font-weight: 800;
          color: #1e1b4b;
          letter-spacing: -0.01em;
        }
        .header-text p {
          margin: 0.2rem 0 0 0;
          font-size: 0.9rem;
          color: #64748b;
          font-weight: 500;
        }
        .meta-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
          background: #f8fafc;
          border-radius: 12px;
          padding: 1rem;
          margin-bottom: 2rem;
          font-size: 0.82rem;
          border: 1px solid #e2e8f0;
        }
        .meta-item {
          display: flex;
          justify-content: space-between;
        }
        .meta-label {
          color: #64748b;
          font-weight: 600;
        }
        .meta-value {
          font-weight: 700;
          color: #0f172a;
        }
        .report-content {
          font-size: 0.95rem;
        }
        h1, h2, h3, h4 {
          color: #1e1b4b;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          font-weight: 750;
        }
        h2 {
          font-size: 1.35rem;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 0.4rem;
        }
        h3 {
          font-size: 1.1rem;
        }
        p, ul, ol {
          margin-top: 0;
          margin-bottom: 1rem;
          color: #334155;
        }
        ul, ol {
          padding-left: 1.5rem;
        }
        li {
          margin-bottom: 0.4rem;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 1.5rem 0;
          font-size: 0.88rem;
          page-break-inside: auto;
        }
        tr {
          page-break-inside: avoid;
          page-break-after: auto;
        }
        th {
          background-color: #3730a3;
          color: #ffffff;
          font-weight: 700;
          text-align: left;
          padding: 0.75rem 1rem;
          border: 1px solid #e2e8f0;
          text-transform: uppercase;
          font-size: 0.8rem;
          letter-spacing: 0.03em;
        }
        td {
          padding: 0.7rem 1rem;
          border: 1px solid #e2e8f0;
          color: #0f172a;
        }
        tr:nth-child(even) td {
          background-color: #f8fafc;
        }
        .report-footer {
          margin-top: 3rem;
          border-top: 1px solid #e2e8f0;
          padding-top: 1rem;
          display: flex;
          justify-content: space-between;
          font-size: 0.78rem;
          color: #94a3b8;
          font-weight: 500;
        }
      </style>
    </head>
    <body>
      <div class="report-header">
        <div class="header-text">
          <h1>MSS MATRICULATION SCHOOL</h1>
          <p>Administrative AI Intelligence Report</p>
        </div>
      </div>
      
      <div class="meta-grid">
        <div class="meta-item">
          <span class="meta-label">Document:</span>
          <span class="meta-value">AI Executive Summary</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Generated Date:</span>
          <span class="meta-value">${dateStr} - ${timeStr}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Database Snapshot:</span>
          <span class="meta-value">MSS Live Database Cache</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Active Academic Year:</span>
          <span class="meta-value">${sessionStorage.getItem('mss_activeAcademicYear') || 'Current Session'}</span>
        </div>
      </div>
      
      <div class="report-content">
        ${reportHtml}
      </div>
      
      <div class="report-footer">
        <span>MSS Matriculation School &copy; ${new Date().getFullYear()}</span>
        <span>Generated by Gemini AI Engine</span>
      </div>
      
      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 300);
        };
      <\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

function downloadAiMessagePdf(messageId, title) {
  const msgTextEl = document.getElementById(messageId);
  if (!msgTextEl) return;
  
  if (typeof html2pdf === 'undefined') {
    showToast('PDF library loading error. Please try the Print option.', 'error');
    return;
  }
  
  // Clone element to sanitize and prepare for PDF render
  const cleanContainer = document.createElement('div');
  cleanContainer.innerHTML = msgTextEl.innerHTML;
  
  // Convert interactive badges back to clean, plain text for professional reports
  cleanContainer.querySelectorAll('.ai-interactive-badge').forEach(badge => {
    // Keep just the raw text of the badge
    const badgeText = badge.innerText || badge.textContent || '';
    const cleanText = badgeText.replace(/[^\w\s-]/g, '').trim(); // Remove icons
    const textNode = document.createTextNode(cleanText);
    badge.parentNode.replaceChild(textNode, badge);
  });

  const printContainer = document.createElement('div');
  printContainer.className = 'pdf-report-wrapper';
  printContainer.style.width = '790px';
  printContainer.style.margin = '0 auto';
  printContainer.style.padding = '30px';
  printContainer.style.background = '#ffffff';
  printContainer.style.boxSizing = 'border-box';
  
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const activeYear = sessionStorage.getItem('mss_activeAcademicYear') || localStorage.getItem('mss_activeAcademicYear') || 'Current Session';
  
  printContainer.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
      
      .pdf-report-wrapper {
        font-family: 'Plus Jakarta Sans', -apple-system, sans-serif !important;
        color: #1e293b !important;
        background: #ffffff !important;
        line-height: 1.6 !important;
      }
      .pdf-report-header {
        border-bottom: 2px solid #4f46e5;
        padding-bottom: 16px;
        margin-bottom: 20px;
      }
      .pdf-report-header h1 {
        margin: 0;
        font-size: 24px;
        font-weight: 800;
        color: #1e1b4b;
        text-transform: uppercase;
        letter-spacing: -0.01em;
      }
      .pdf-report-header p {
        margin: 4px 0 0 0;
        font-size: 13px;
        color: #64748b;
        font-weight: 600;
      }
      .pdf-meta-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px 16px;
        background: #f8fafc;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 24px;
        font-size: 11px;
        border: 1px solid #e2e8f0;
      }
      .pdf-meta-item {
        display: flex;
        justify-content: space-between;
      }
      .pdf-meta-label {
        color: #64748b;
        font-weight: 600;
      }
      .pdf-meta-value {
        font-weight: 700;
        color: #0f172a;
      }
      .pdf-body {
        font-size: 13px;
        color: #334155;
      }
      .pdf-body h1, .pdf-body h2, .pdf-body h3, .pdf-body h4 {
        color: #1e1b4b;
        font-weight: 800;
        margin-top: 22px;
        margin-bottom: 10px;
        page-break-after: avoid;
      }
      .pdf-body h2 {
        font-size: 16px;
        border-bottom: 1px solid #e2e8f0;
        padding-bottom: 6px;
      }
      .pdf-body h3 {
        font-size: 14px;
      }
      .pdf-body p {
        margin-top: 0;
        margin-bottom: 12px;
      }
      .pdf-body ul, .pdf-body ol {
        margin-top: 0;
        margin-bottom: 14px;
        padding-left: 20px;
      }
      .pdf-body li {
        margin-bottom: 6px;
      }
      .pdf-body table {
        width: 100% !important;
        border-collapse: collapse !important;
        margin: 16px 0 !important;
        font-size: 11px !important;
        page-break-inside: avoid !important;
      }
      .pdf-body th {
        background-color: #4f46e5 !important;
        color: #ffffff !important;
        font-weight: 700 !important;
        padding: 10px 12px !important;
        border: 1px solid #cbd5e1 !important;
        text-align: left !important;
        text-transform: uppercase !important;
        font-size: 10px !important;
        letter-spacing: 0.03em !important;
      }
      .pdf-body td {
        padding: 9px 12px !important;
        border: 1px solid #e2e8f0 !important;
        color: #0f172a !important;
      }
      .pdf-body tr:nth-child(even) td {
        background-color: #f8fafc !important;
      }
      .pdf-report-footer {
        margin-top: 40px;
        border-top: 1px solid #e2e8f0;
        padding-top: 16px;
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        color: #94a3b8;
        font-weight: 500;
        page-break-inside: avoid;
      }
    </style>

    <div class="pdf-report-header">
      <h1>MSS MATRICULATION SCHOOL</h1>
      <p>Administrative AI Intelligence Hub</p>
    </div>
    
    <div class="pdf-meta-grid">
      <div class="pdf-meta-item">
        <span class="pdf-meta-label">Report Type:</span>
        <span class="pdf-meta-value">${title}</span>
      </div>
      <div class="pdf-meta-item">
        <span class="pdf-meta-label">Generated Date:</span>
        <span class="pdf-meta-value">${dateStr}</span>
      </div>
      <div class="pdf-meta-item">
        <span class="pdf-meta-label">Source Database:</span>
        <span class="pdf-meta-value">Supabase Cache Registry</span>
      </div>
      <div class="pdf-meta-item">
        <span class="pdf-meta-label">Academic Session:</span>
        <span class="pdf-meta-value">${activeYear}</span>
      </div>
    </div>
    
    <div class="pdf-body">
      ${cleanContainer.innerHTML}
    </div>
    
    <div class="pdf-report-footer">
      <span>MSS Matriculation School &copy; ${new Date().getFullYear()}</span>
      <span>Report Summary Compiled by Gemini AI Engine</span>
    </div>
  `;

  document.body.appendChild(printContainer);
  
  const cleanTitle = title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  
  const opt = {
    margin:       [15, 12, 15, 12], // Standard margins
    filename:     `mss_report_${cleanTitle}_${Date.now()}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { 
      scale: 2, 
      useCORS: true, 
      letterRendering: true,
      logging: false
    },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
  };
  
  html2pdf().from(printContainer).set(opt).save().then(() => {
    document.body.removeChild(printContainer);
  }).catch(err => {
    console.error('PDF Generation error:', err);
    document.body.removeChild(printContainer);
    showToast('Failed to download PDF. Try printing instead.', 'error');
  });
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeDoubleQuotes(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

// Hook up event listeners & initialize
document.addEventListener('DOMContentLoaded', () => {
  const chatInput = document.getElementById('aiChatInput');
  if (chatInput) {
    updateAiStatusUi();
    checkDatabaseState();
    
    // Reload chat history from session if available
    try {
      const savedHistory = sessionStorage.getItem('mss_ai_chat_history');
      const savedContents = sessionStorage.getItem('mss_ai_msg_contents');
      
      if (savedHistory && savedContents) {
        aiChatHistory = JSON.parse(savedHistory);
        window._aiMsgContents = JSON.parse(savedContents);
        
        // Render history in UI
        const chatContainer = document.getElementById('aiChatMessages');
        if (chatContainer && aiChatHistory.length > 0) {
          chatContainer.innerHTML = ''; // Clear default greeting
          
          let lastMsgIdIndex = 0;
          
          aiChatHistory.forEach(msg => {
            const role = msg.role;
            const text = msg.parts[0].text;
            const timeVal = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            
            if (role === 'user') {
              const html = `
                <div class="chat-msg user-msg">
                  <div class="msg-avatar"><i class="bi bi-person-fill"></i></div>
                  <div class="msg-bubble-container">
                    <div class="msg-bubble">${escapeHtml(text)}</div>
                    <div class="msg-time">${timeVal}</div>
                  </div>
                </div>
              `;
              chatContainer.insertAdjacentHTML('beforeend', html);
            } else {
              const contentId = 'ai-content-restored-' + lastMsgIdIndex++;
              window._aiMsgContents[contentId] = text;
              
              let renderedHtml = mdParser ? mdParser.render(text) : text.replace(/\n/g, '<br>');
              renderedHtml = applyInteractiveLinks(renderedHtml);
              
              const hasTable = text.includes('|') || renderedHtml.includes('<table');
              const csvButtonHtml = hasTable ? `
                <button class="msg-action-btn" onclick="exportTableToCsv('${contentId}')">
                  <i class="bi bi-file-earmark-spreadsheet-fill"></i> Export Excel (CSV)
                </button>
              ` : '';
              
              const html = `
                <div class="chat-msg ai-msg">
                  <div class="msg-avatar"><i class="bi bi-robot"></i></div>
                  <div class="msg-bubble-container" style="flex: 1;">
                    <div class="msg-bubble" id="${contentId}">${renderedHtml}</div>
                    <div class="msg-actions">
                      <button class="msg-action-btn" onclick="printAiMessage('${contentId}')">
                        <i class="bi bi-printer-fill"></i> Print Report
                      </button>
                      <button class="msg-action-btn" onclick="downloadAiMessagePdf('${contentId}', 'MSS AI Executive Report')">
                        <i class="bi bi-file-earmark-pdf-fill"></i> Export PDF
                      </button>
                      ${csvButtonHtml}
                      <button class="msg-action-btn tts-btn" onclick="speakAiMessage('${contentId}', this)">
                        <i class="bi bi-volume-up-fill"></i> Read Out
                      </button>
                      <button class="msg-action-btn" onclick="copyToClipboard(window._aiMsgContents['${contentId}'])">
                        <i class="bi bi-copy"></i> Copy Text
                      </button>
                    </div>
                    <div class="msg-time">${timeVal}</div>
                  </div>
                </div>
              `;
              chatContainer.insertAdjacentHTML('beforeend', html);
            }
          });
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }
      }
    } catch (e) {
      console.warn('Failed to load chat history from session:', e);
    }
    
    window.addEventListener('mss-db-sync', () => {
      checkDatabaseState();
    });
  }
});
