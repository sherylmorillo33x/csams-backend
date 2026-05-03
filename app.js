'use strict';

// ================================================================
//  CSAMS — Full-Stack App (Supabase + Vercel Static)
//
//  HOW TO DEPLOY:
//  1. Create a Supabase project at https://supabase.com
//  2. Run SUPABASE_SETUP.sql in your Supabase SQL Editor
//  3. Copy your Project URL and anon key below
//  4. Push this folder to GitHub, then deploy on Vercel (Static)
// ================================================================

// ─── CONFIGURE THESE TWO LINES ─────────────────────────────────
const SUPABASE_URL  = 'https://elypzoaiofaoactnmycx.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVseXB6b2Fpb2Zhb2FjdG5teWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzI4NTcsImV4cCI6MjA5MzQwODg1N30.1wNSm04B6ki9bDI6LGnp6AxJ4pWefI8811BR-ST8ToQ';
// ───────────────────────────────────────────────────────────────

// ================================================================
//  SUPABASE REST CLIENT
//  Thin wrapper around fetch — no SDK needed.
// ================================================================
const db = {
  _h() {
    return {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
  },

  // SELECT — returns array of rows
  async select(table, params = '') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      headers: this._h()
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // INSERT — returns inserted row(s)
  async insert(table, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: this._h(),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // UPDATE — returns updated row(s), filter like 'id=eq.abc'
  async update(table, filter, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: 'PATCH',
      headers: this._h(),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // DELETE — filter like 'id=eq.abc'
  async delete(table, filter) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: 'DELETE',
      headers: { ...this._h(), 'Prefer': 'return=minimal' }
    });
    if (!res.ok) throw new Error(await res.text());
  },

  // RPC — call a postgres function (not used yet, reserved)
  async rpc(fn, params = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: this._h(),
      body: JSON.stringify(params)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
};

// ================================================================
//  APP-LEVEL CACHE
//  Loaded once on login; invalidated on write operations.
// ================================================================
let _cache = {};

async function load(table, query = '') {
  if (!_cache[table]) {
    _cache[table] = await db.select(table, query);
  }
  return _cache[table];
}

function invalidate(...tables) {
  tables.forEach(t => { delete _cache[t]; });
}

// ================================================================
//  CONSTANTS
// ================================================================
const COURSES  = ['ACT', 'BSIT', 'BSIS'];
const YEARS    = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const SEMS     = ['1st Semester', '2nd Semester'];
const SECTIONS = ['A', 'B'];

// ================================================================
//  CURRENT USER
// ================================================================
let currentUser = null;

// ================================================================
//  TOAST NOTIFICATIONS
// ================================================================
let _toastTimer = null;
function toast(msg, type = 'ok') {
  const el = getEl('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast ${type}-toast`;
  el.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

// ================================================================
//  LOGIN / LOGOUT
// ================================================================
async function doLogin() {
  const username = getEl('uname').value.trim();
  const password = getEl('upass').value;
  const btn = getEl('loginBtn');

  if (!username || !password) {
    show('loginErr');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Signing in…';
  hide('loginErr');

  try {
    const rows = await db.select(
      'csams_users',
      `username=eq.${encodeURIComponent(username)}&password=eq.${encodeURIComponent(password)}&select=id,username,name,role,status`
    );

    if (!rows || rows.length === 0) {
      show('loginErr');
      return;
    }

    const user = rows[0];

    if (user.status === 'Inactive') {
      getEl('loginErr').textContent = 'Your account is inactive.';
      show('loginErr');
      return;
    }

    currentUser = { id: user.id, username: user.username, name: user.name, role: user.role };

    // For students, load their student record to get studentId
    if (user.role === 'student') {
      const stRec = await db.select('csams_students', `user_id=eq.${user.id}&select=id`);
      if (stRec && stRec.length > 0) {
        currentUser.studentId = stRec[0].id;
      }
    }

    // For instructors, load instructor record
    if (user.role === 'instructor') {
      const instRec = await db.select('csams_instructors', `user_id=eq.${user.id}&select=id`);
      if (instRec && instRec.length > 0) {
        currentUser.instructorId = instRec[0].id;
      }
    }

    startApp();

  } catch (err) {
    console.error('Login error:', err);
    getEl('loginErr').textContent = 'Connection error. Check your Supabase config.';
    show('loginErr');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Sign In';
  }
}

function startApp() {
  hide('loginErr');
  getEl('nameLabel').textContent = currentUser.name;
  getEl('roleLabel').textContent = capitalize(currentUser.role);
  getEl('ava').textContent = currentUser.name.charAt(0).toUpperCase();
  buildNav();
  switchScreen('appScreen');
  navigate('dashboard');
}

function doLogout() {
  currentUser = null;
  _cache = {};
  switchScreen('loginScreen');
  getEl('uname').value = '';
  getEl('upass').value = '';
}

getEl('upass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

// ================================================================
//  NAVIGATION
// ================================================================
const MENUS = {
  admin:      [['&#9632;','dashboard','Dashboard'],['&#9632;','students','Students'],['&#9632;','instructors','Instructors'],['&#9632;','subjects','Subjects'],['&#9632;','grades','Grades']],
  instructor: [['&#9632;','dashboard','Dashboard'],['&#9632;','myclasses','My Classes']],
  student:    [['&#9632;','dashboard','Dashboard'],['&#9632;','mygrades','My Grades']],
};

function buildNav() {
  let html = '<span class="nav-lbl">Menu</span>';
  MENUS[currentUser.role].forEach(([icon, page, label]) => {
    html += `<button class="nav-btn" data-p="${page}" onclick="navigate('${page}')">
               <span class="nav-ico">${icon}</span>${label}
             </button>`;
  });
  getEl('sideNav').innerHTML = html;
}

function navigate(page) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.p === page));
  const pages = { dashboard, students, instructors, subjects, grades, myclasses, mygrades };
  (pages[page] || dashboard)();
  if (window.innerWidth < 768) getEl('sidebar').classList.remove('open');
}

// ================================================================
//  LOADING HELPER
// ================================================================
function renderLoading(msg = 'Loading data…') {
  render(`<div class="page-loading"><span class="spinner"></span>${msg}</div>`);
}

// ================================================================
//  DASHBOARD
// ================================================================
async function dashboard() {
  renderLoading();
  try {
    if (currentUser.role === 'admin') {
      const [students, instructors, grades] = await Promise.all([
        load('csams_students', 'select=id'),
        load('csams_instructors', 'select=id'),
        load('csams_grades', 'select=id')
      ]);
      render(`
        ${pageHeader('Dashboard', 'System overview')}
        <div class="stats">
          ${statCard('s1', 'Students',     students.length,    'Enrolled')}
          ${statCard('s2', 'Instructors',  instructors.length, 'Active')}
          ${statCard('s3', 'Grade Entries',grades.length,      'Posted')}
        </div>
        <div style="padding:0 26px">
          <div class="card">
            <div class="card-head">Welcome, Administrator</div>
            <div class="card-body"><p style="color:var(--text2)">Manage students, instructors, subjects and grades from the sidebar.</p></div>
          </div>
        </div>
      `);

    } else if (currentUser.role === 'instructor') {
      const assignments = await db.select('csams_assignments', `instructor_id=eq.${currentUser.instructorId}`);
      const subjectIds = assignments.map(a => a.subject_id);
      let gradeCount = 0;
      if (subjectIds.length > 0) {
        const gradeRows = await db.select('csams_grades', `subject_id=in.(${subjectIds.join(',')})&select=id`);
        gradeCount = gradeRows.length;
      }
      render(`
        ${pageHeader('Dashboard', 'Instructor overview')}
        <div class="stats" style="grid-template-columns:1fr 1fr">
          ${statCard('s1', 'Assignments',  assignments.length, 'Classes handled')}
          ${statCard('s2', 'Grade Entries',gradeCount,         'Posted')}
        </div>
        <div style="padding:0 26px">
          <div class="card">
            <div class="card-head">Welcome, ${currentUser.name}</div>
            <div class="card-body"><p style="color:var(--text2)">Go to <b>My Classes</b> to view your assignments and post grades.</p></div>
          </div>
        </div>
      `);

    } else {
      const myGrades = await db.select('csams_grades', `student_id=eq.${currentUser.studentId}`);
      const gwa = computeGWAFromList(myGrades);
      render(`
        ${pageHeader('Dashboard', 'Student overview')}
        <div class="stats" style="grid-template-columns:1fr 1fr">
          ${statCard('s1', 'Subjects w/ Grade', myGrades.length, 'This term')}
          ${statCard('s2', 'GWA', gwa, 'Weighted Average')}
        </div>
        <div style="padding:0 26px">
          <div class="card">
            <div class="card-head">Welcome, ${currentUser.name}</div>
            <div class="card-body"><p style="color:var(--text2)">View your grades from <b>My Grades</b>.</p></div>
          </div>
        </div>
      `);
    }
  } catch (err) {
    render(`<div style="padding:26px"><div class="msg err">Failed to load dashboard: ${err.message}</div></div>`);
  }
}

// ================================================================
//  STUDENTS PAGE (admin only)
// ================================================================
async function students() {
  renderLoading();
  try {
    const list = await db.select('csams_students', 'order=name.asc');
    _cache['csams_students'] = list;

    const rows = list.map(s => `
      <tr data-course="${s.course}" data-year="${s.year}" data-section="${s.section}">
        <td>${s.name}</td>
        <td><span class="pill">${s.id}</span></td>
        <td>${s.course}</td>
        <td>${s.year}</td>
        <td>${s.section}</td>
        <td><span class="badge ${s.status}">${s.status}</span></td>
        <td>
          <button class="btn sm ghost" onclick='openStuModal(${toAttr(s)})'>Edit</button>
          <button class="btn sm danger" onclick="delStu('${s.id}')">Delete</button>
        </td>
      </tr>`).join('') || `<tr><td colspan="7" class="empty">No records.</td></tr>`;

    render(`
      ${pageHeader('Students', 'Enrolled student records')}
      <div class="tb">
        <input class="search" placeholder="Search name or ID…" oninput="filterTable(this,'stuTbl')">
        ${filterSelect("filterByAttr(this,'stuTbl','course')", 'All Courses',    COURSES.map(c=>[c,c]))}
        ${filterSelect("filterByAttr(this,'stuTbl','year')",   'All Year Levels',YEARS.map(y=>[y,y]))}
        ${filterSelect("filterByAttr(this,'stuTbl','section')","All Sections",   SECTIONS.map(s=>[s,'Section '+s]))}
        <button class="btn primary" onclick="openStuModal()">+ Add Student</button>
      </div>
      <div class="tbl-wrap">
        <table id="stuTbl">
          <thead><tr>
            <th class="sortable-th" onclick="sortTable('stuTbl',0)">Name ⇅</th>
            <th>Student ID</th>
            <th class="sortable-th" onclick="sortTable('stuTbl',2)">Course ⇅</th>
            <th class="sortable-th" onclick="sortTable('stuTbl',3)">Year Level ⇅</th>
            <th>Section</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="tbl-foot">${list.length} record(s)</div>
    `);
  } catch (err) {
    render(`<div style="padding:26px"><div class="msg err">Error: ${err.message}</div></div>`);
  }
}

function openStuModal(s = null) {
  modal(`
    <div class="m-head">
      <h3>${s ? 'Edit' : 'Add'} Student</h3>
      <button class="m-close" onclick="closeModal()">&#x2715;</button>
    </div>
    <div class="m-body">
      <div class="field-row">
        <div class="field"><label>Student ID *</label><input id="mId" value="${s?.id||''}" ${s?'readonly':''}></div>
        <div class="field"><label>Full Name *</label><input id="mName" value="${s?.name||''}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Course</label><select id="mCourse">${selectOptions(COURSES,s?.course)}</select></div>
        <div class="field"><label>Year Level</label><select id="mYear">${selectOptions(YEARS,s?.year)}</select></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Section</label><select id="mSec">${selectOptions(SECTIONS,s?.section)}</select></div>
        <div class="field"><label>Status</label><select id="mStatus">${selectOptions(['Active','Inactive'],s?.status)}</select></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Username *</label><input id="mUname" value="${s?.username||''}"></div>
        <div class="field"><label>Password</label><input id="mPass" type="password" placeholder="${s?'Leave blank to keep':'Set password'}"></div>
      </div>
      <div id="mMsg"></div>
    </div>
    <div class="m-foot">
      <button class="btn primary" id="saveStuBtn" onclick="saveStu('${s?.id||''}','${s?.user_id||''}')">Save</button>
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function saveStu(editId, existingUserId) {
  const sid      = val('mId').trim();
  const name     = val('mName').trim();
  const course   = val('mCourse');
  const year     = val('mYear');
  const section  = val('mSec');
  const status   = val('mStatus');
  const username = val('mUname').trim();
  const pass     = val('mPass');

  if (!sid || !name || !username) { setMsg('mMsg','err','Fill all required fields.'); return; }

  const btn = getEl('saveStuBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    if (editId) {
      // Update student record
      await db.update('csams_students', `id=eq.${editId}`, { name, course, year, section, status });
      // Update user record
      const userUpdate = { name, status };
      if (username) userUpdate.username = username;
      if (pass)     userUpdate.password = pass;
      await db.update('csams_users', `id=eq.${existingUserId}`, userUpdate);
      invalidate('csams_students');
      toast('Student updated successfully.');
    } else {
      // Check duplicate student ID
      const existing = await db.select('csams_students', `id=eq.${sid}`);
      if (existing.length > 0) { setMsg('mMsg','err','Student ID already exists.'); return; }
      // Check duplicate username
      const existUser = await db.select('csams_users', `username=eq.${username}`);
      if (existUser.length > 0) { setMsg('mMsg','err','Username already taken.'); return; }
      // Create user account
      const [newUser] = await db.insert('csams_users', {
        username, password: pass || 'stu2026', name, role: 'student', status
      });
      // Create student record
      await db.insert('csams_students', { id: sid, user_id: newUser.id, name, course, year, section, status });
      invalidate('csams_students');
      toast('Student added successfully.');
    }
    closeModal();
    students();
  } catch (err) {
    setMsg('mMsg','err','Error: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Save';
  }
}

async function delStu(studentId) {
  if (!confirm('Delete this student? Their grades will also be removed.')) return;
  try {
    await db.delete('csams_grades', `student_id=eq.${studentId}`);
    // Get user_id first
    const [rec] = await db.select('csams_students', `id=eq.${studentId}&select=user_id`);
    await db.delete('csams_students', `id=eq.${studentId}`);
    if (rec?.user_id) await db.delete('csams_users', `id=eq.${rec.user_id}`);
    invalidate('csams_students','csams_grades');
    toast('Student deleted.');
    students();
  } catch (err) {
    toast('Delete failed: ' + err.message, 'err');
  }
}

// ================================================================
//  INSTRUCTORS PAGE (admin only)
// ================================================================
async function instructors() {
  renderLoading();
  try {
    const [instrList, subjects] = await Promise.all([
      db.select('csams_instructors', 'order=name.asc'),
      load('csams_subjects')
    ]);
    _cache['csams_instructors'] = instrList;

    // Load assignments for all instructors in one query
    const allAssignments = instrList.length > 0
      ? await db.select('csams_assignments', `instructor_id=in.(${instrList.map(i=>i.id).join(',')})`)
      : [];

    const rows = instrList.map(instr => {
      const myAssign = allAssignments.filter(a => a.instructor_id === instr.id);
      let assignHTML = myAssign.length === 0
        ? '<span style="color:var(--text3)">None</span>'
        : myAssign.map(a => {
            const sub = subjects.find(s => s.id === a.subject_id);
            return `<span class="pill" style="margin:2px 2px 2px 0;display:inline-block">${sub?.code||a.subject_id} §${a.section}</span>`;
          }).join(' ');

      return `
        <tr>
          <td>${instr.name}</td>
          <td><span class="badge ${instr.status}">${instr.status}</span></td>
          <td style="max-width:260px">${assignHTML}</td>
          <td>
            <button class="btn sm ghost" onclick='openInstrModal(${toAttr({...instr, username: instr.username||""})})'>Edit</button>
            <button class="btn sm ghost" onclick="openAssignModal('${instr.id}','${instr.name}')">Assign</button>
            <button class="btn sm danger" onclick="delInstr('${instr.id}')">Del</button>
          </td>
        </tr>`;
    }).join('') || `<tr><td colspan="4" class="empty">No instructors.</td></tr>`;

    render(`
      ${pageHeader('Instructors', 'Instructor records and class assignments')}
      <div class="tb">
        <input class="search" placeholder="Search name…" oninput="filterTable(this,'instrTbl')">
        <button class="btn primary" onclick="openInstrModal()">+ Add Instructor</button>
      </div>
      <div class="tbl-wrap">
        <table id="instrTbl">
          <thead><tr>
            <th class="sortable-th" onclick="sortTable('instrTbl',0)">Name ⇅</th>
            <th>Status</th><th>Assignments</th><th>Actions</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="tbl-foot">${instrList.length} instructor(s)</div>
    `);
  } catch (err) {
    render(`<div style="padding:26px"><div class="msg err">Error: ${err.message}</div></div>`);
  }
}

function openInstrModal(instr = null) {
  modal(`
    <div class="m-head">
      <h3>${instr ? 'Edit' : 'Add'} Instructor</h3>
      <button class="m-close" onclick="closeModal()">&#x2715;</button>
    </div>
    <div class="m-body">
      <div class="field"><label>Full Name *</label><input id="mName" value="${instr?.name||''}"></div>
      <div class="field-row">
        <div class="field"><label>Username *</label><input id="mUname" value="${instr?.username||''}"></div>
        <div class="field"><label>Password</label><input id="mPass" type="password" placeholder="${instr?'Leave blank to keep':'Set password'}"></div>
      </div>
      <div class="field"><label>Status</label><select id="mStatus">${selectOptions(['Active','Inactive'],instr?.status||'Active')}</select></div>
      <div id="mMsg"></div>
    </div>
    <div class="m-foot">
      <button class="btn primary" id="saveInstrBtn" onclick="saveInstr('${instr?.id||''}','${instr?.user_id||''}')">Save</button>
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function saveInstr(editId, existingUserId) {
  const name     = val('mName').trim();
  const username = val('mUname').trim();
  const pass     = val('mPass');
  const status   = val('mStatus');

  if (!name || !username) { setMsg('mMsg','err','Name and username are required.'); return; }

  const btn = getEl('saveInstrBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    if (editId) {
      await db.update('csams_instructors', `id=eq.${editId}`, { name, status });
      const userUpdate = { name, status };
      if (username) userUpdate.username = username;
      if (pass)     userUpdate.password = pass;
      await db.update('csams_users', `id=eq.${existingUserId}`, userUpdate);
      invalidate('csams_instructors');
      toast('Instructor updated.');
    } else {
      const existUser = await db.select('csams_users', `username=eq.${username}`);
      if (existUser.length > 0) { setMsg('mMsg','err','Username already taken.'); return; }
      const [newUser] = await db.insert('csams_users', {
        username, password: pass || 'inst2026', name, role: 'instructor', status
      });
      await db.insert('csams_instructors', { user_id: newUser.id, name, status });
      invalidate('csams_instructors');
      toast('Instructor added.');
    }
    closeModal();
    instructors();
  } catch (err) {
    setMsg('mMsg','err','Error: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Save';
  }
}

async function delInstr(instrId) {
  if (!confirm('Delete this instructor and all their assignments?')) return;
  try {
    await db.delete('csams_assignments', `instructor_id=eq.${instrId}`);
    const [rec] = await db.select('csams_instructors', `id=eq.${instrId}&select=user_id`);
    await db.delete('csams_instructors', `id=eq.${instrId}`);
    if (rec?.user_id) await db.delete('csams_users', `id=eq.${rec.user_id}`);
    invalidate('csams_instructors');
    toast('Instructor deleted.');
    instructors();
  } catch (err) {
    toast('Delete failed: ' + err.message, 'err');
  }
}

async function openAssignModal(instrId, instrName) {
  const subjects = await load('csams_subjects');
  modal(`
    <div class="m-head">
      <h3>Add Assignment — ${instrName}</h3>
      <button class="m-close" onclick="closeModal()">&#x2715;</button>
    </div>
    <div class="m-body">
      <div class="field-row">
        <div class="field"><label>Course</label>
          <select id="aCourse" onchange="refreshSubjects()">${selectOptions(COURSES)}</select>
        </div>
        <div class="field"><label>Year Level</label>
          <select id="aYear" onchange="refreshSubjects()">${selectOptions(YEARS)}</select>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>Semester</label>
          <select id="aSem" onchange="refreshSubjects()">${selectOptions(SEMS)}</select>
        </div>
        <div class="field"><label>Section</label>
          <select id="aSec">${selectOptions(SECTIONS)}</select>
        </div>
      </div>
      <div class="field"><label>Subject</label><select id="aSub"></select></div>
      <div id="mMsg"></div>
    </div>
    <div class="m-foot">
      <button class="btn primary" id="saveAssignBtn" onclick="saveAssign('${instrId}')">Assign</button>
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
    </div>
  `);
  refreshSubjects();
}

function refreshSubjects() {
  const course  = val('aCourse');
  const year    = val('aYear');
  const sem     = val('aSem');
  const subs    = (_cache['csams_subjects'] || []).filter(s => s.course===course && s.year===year && s.sem===sem);
  getEl('aSub').innerHTML = subs.length
    ? subs.map(s => `<option value="${s.id}">${s.code} – ${s.title}</option>`).join('')
    : '<option value="">No subjects for this selection</option>';
}

async function saveAssign(instrId) {
  const course    = val('aCourse');
  const year      = val('aYear');
  const sem       = val('aSem');
  const section   = val('aSec');
  const subjectId = val('aSub');

  if (!subjectId) { setMsg('mMsg','err','No subject available.'); return; }

  const btn = getEl('saveAssignBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    // Check conflict with other instructors
    const conflicts = await db.select('csams_assignments',
      `course=eq.${course}&year=eq.${encodeURIComponent(year)}&sem=eq.${encodeURIComponent(sem)}&section=eq.${section}&subject_id=eq.${subjectId}&instructor_id=neq.${instrId}`
    );
    if (conflicts.length > 0) {
      setMsg('mMsg','err','Conflict: another instructor is already assigned to this class-subject.');
      return;
    }
    await db.insert('csams_assignments', { instructor_id: instrId, course, year, sem, section, subject_id: subjectId });
    invalidate('csams_instructors');
    toast('Assignment saved.');
    closeModal();
    instructors();
  } catch (err) {
    setMsg('mMsg','err', err.message.includes('unique') ? 'Already assigned to this class-subject.' : 'Error: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Assign';
  }
}

// ================================================================
//  SUBJECTS PAGE (admin only)
// ================================================================
async function subjects() {
  renderLoading();
  try {
    const list = await db.select('csams_subjects', 'order=code.asc');
    _cache['csams_subjects'] = list;

    const rows = list.map(s => `
      <tr data-course="${s.course}" data-year="${s.year}" data-sem="${s.sem}">
        <td><span class="pill">${s.code}</span></td>
        <td>${s.title}</td>
        <td>${s.course}</td>
        <td>${s.year}</td>
        <td>${s.sem}</td>
        <td>${s.units}</td>
        <td>
          <button class="btn sm ghost"  onclick='openSubModal(${toAttr(s)})'>Edit</button>
          <button class="btn sm danger" onclick="delSub('${s.id}')">Del</button>
        </td>
      </tr>`).join('') || `<tr><td colspan="7" class="empty">No subjects.</td></tr>`;

    render(`
      ${pageHeader('Subjects', 'Subjects per course, year and semester')}
      <div class="tb">
        <input class="search" placeholder="Search code or title…" oninput="filterTable(this,'subTbl')">
        ${filterSelect("filterByAttr(this,'subTbl','course')","All Courses",    COURSES.map(c=>[c,c]))}
        ${filterSelect("filterByAttr(this,'subTbl','year')",  "All Year Levels",YEARS.map(y=>[y,y]))}
        ${filterSelect("filterByAttr(this,'subTbl','sem')",   "All Semesters",  SEMS.map(s=>[s,s]))}
        <button class="btn primary" onclick="openSubModal()">+ Add Subject</button>
      </div>
      <div class="tbl-wrap">
        <table id="subTbl">
          <thead><tr>
            <th>Code</th>
            <th class="sortable-th" onclick="sortTable('subTbl',1)">Title ⇅</th>
            <th class="sortable-th" onclick="sortTable('subTbl',2)">Course ⇅</th>
            <th class="sortable-th" onclick="sortTable('subTbl',3)">Year ⇅</th>
            <th>Semester</th><th>Units</th><th>Actions</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="tbl-foot">${list.length} subject(s)</div>
    `);
  } catch (err) {
    render(`<div style="padding:26px"><div class="msg err">Error: ${err.message}</div></div>`);
  }
}

function openSubModal(s = null) {
  modal(`
    <div class="m-head">
      <h3>${s ? 'Edit' : 'Add'} Subject</h3>
      <button class="m-close" onclick="closeModal()">&#x2715;</button>
    </div>
    <div class="m-body">
      <div class="field-row">
        <div class="field"><label>Code *</label><input id="mCode" value="${s?.code||''}" ${s?'readonly':''}></div>
        <div class="field"><label>Units</label><input id="mUnits" type="number" min="1" max="6" value="${s?.units||3}"></div>
      </div>
      <div class="field"><label>Title *</label><input id="mTitle" value="${s?.title||''}"></div>
      <div class="field-row">
        <div class="field"><label>Course</label><select id="mCourse">${selectOptions(COURSES,s?.course)}</select></div>
        <div class="field"><label>Year Level</label><select id="mYear">${selectOptions(YEARS,s?.year)}</select></div>
      </div>
      <div class="field"><label>Semester</label><select id="mSem">${selectOptions(SEMS,s?.sem)}</select></div>
      <div id="mMsg"></div>
    </div>
    <div class="m-foot">
      <button class="btn primary" id="saveSubBtn" onclick="saveSub('${s?.id||''}')">Save</button>
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function saveSub(editId) {
  const code   = val('mCode').trim();
  const title  = val('mTitle').trim();
  const units  = Number(val('mUnits'));
  const course = val('mCourse');
  const year   = val('mYear');
  const sem    = val('mSem');

  if (!code || !title) { setMsg('mMsg','err','Code and Title are required.'); return; }

  const btn = getEl('saveSubBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    if (editId) {
      await db.update('csams_subjects', `id=eq.${editId}`, { title, units, course, year, sem });
      invalidate('csams_subjects');
      toast('Subject updated.');
    } else {
      const existing = await db.select('csams_subjects', `code=eq.${code}`);
      if (existing.length > 0) { setMsg('mMsg','err','Code already exists.'); return; }
      await db.insert('csams_subjects', { id: 's' + Date.now(), course, year, sem, code, title, units });
      invalidate('csams_subjects');
      toast('Subject added.');
    }
    closeModal();
    subjects();
  } catch (err) {
    setMsg('mMsg','err','Error: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Save';
  }
}

async function delSub(subjectId) {
  if (!confirm('Delete this subject? Related assignments and grades will also be removed.')) return;
  try {
    await db.delete('csams_grades', `subject_id=eq.${subjectId}`);
    await db.delete('csams_assignments', `subject_id=eq.${subjectId}`);
    await db.delete('csams_subjects', `id=eq.${subjectId}`);
    invalidate('csams_subjects');
    toast('Subject deleted.');
    subjects();
  } catch (err) {
    toast('Delete failed: ' + err.message, 'err');
  }
}

// ================================================================
//  GRADES PAGE (admin only)
// ================================================================
async function grades() {
  renderLoading();
  try {
    const [gradeList, studentList, subList] = await Promise.all([
      db.select('csams_grades', 'order=created_at.desc'),
      load('csams_students'),
      load('csams_subjects')
    ]);
    _cache['csams_grades'] = gradeList;

    const rows = gradeList.map((g, index) => {
      const student = studentList.find(s => s.id === g.student_id);
      const subject = subList.find(s => s.id === g.subject_id);
      const finalGrade  = g.finals != null ? (g.grade?.toFixed(2) || '—') : '—';
      const remarksHTML = g.finals != null && g.remarks
        ? `<span class="badge ${g.remarks}">${g.remarks}</span>` : '—';

      return `
        <tr data-sem="${g.sem||''}" data-course="${student?.course||''}" data-year="${student?.year||''}">
          <td>${student?.name || g.student_id}</td>
          <td><span class="pill">${subject?.code||'?'}</span> ${subject?.title||''}</td>
          <td style="white-space:nowrap;font-size:.75rem">${g.sem||'—'}</td>
          <td>${g.midterm ?? '—'}</td>
          <td>${g.finals  ?? '—'}</td>
          <td><b style="font-family:var(--fh);font-size:1.1rem">${finalGrade}</b></td>
          <td>${remarksHTML}</td>
          <td style="white-space:nowrap">
            <button class="btn sm ghost"  onclick="openGradeModal('${g.id}')">Edit</button>
            <button class="btn sm danger" onclick="delGrade('${g.id}')">Del</button>
          </td>
        </tr>`;
    }).join('') || `<tr><td colspan="8" class="empty">No grades posted.</td></tr>`;

    render(`
      ${pageHeader('Grade Management', 'Post and manage student grades')}
      <div class="tb">
        <input class="search" placeholder="Search student or subject…" oninput="filterTable(this,'grTbl')">
        ${filterSelect("filterByAttr(this,'grTbl','course')",'All Courses',    COURSES.map(c=>[c,c]))}
        ${filterSelect("filterByAttr(this,'grTbl','year')",  'All Year Levels',YEARS.map(y=>[y,y]))}
        ${filterSelect("filterByAttr(this,'grTbl','sem')",   'All Semesters',  SEMS.map(s=>[s,s]))}
        <button class="btn primary" onclick="openGradeModal()">+ Post Grade</button>
      </div>
      <div class="tbl-wrap">
        <table id="grTbl">
          <thead><tr>
            <th class="sortable-th" onclick="sortTable('grTbl',0)">Student ⇅</th>
            <th>Subject</th><th>Semester</th>
            <th class="sortable-th" onclick="sortTable('grTbl',3)">Midterm ⇅</th>
            <th class="sortable-th" onclick="sortTable('grTbl',4)">Finals ⇅</th>
            <th class="sortable-th" onclick="sortTable('grTbl',5)">Final Grade ⇅</th>
            <th>Remarks</th><th>Actions</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="tbl-foot">${gradeList.length} entry/entries</div>
    `);
  } catch (err) {
    render(`<div style="padding:26px"><div class="msg err">Error: ${err.message}</div></div>`);
  }
}

// gradeId = UUID of existing grade, or null for new
// prefill = {student_id, subject_id, sem} for instructor flow
async function openGradeModal(gradeId = null, prefill = null) {
  const [studentList, subList] = await Promise.all([
    load('csams_students'),
    load('csams_subjects')
  ]);

  let g = null;
  if (gradeId) {
    const cached = (_cache['csams_grades'] || []).find(x => x.id === gradeId);
    g = cached || (await db.select('csams_grades', `id=eq.${gradeId}`))[0] || null;
  }
  if (!g && prefill) g = { ...prefill };

  const studentOptions = studentList.map(s =>
    `<option value="${s.id}" ${g?.student_id===s.id?'selected':''}>${s.name} (${s.id})</option>`
  ).join('');

  const subjectOptions = subList.map(s =>
    `<option value="${s.id}" ${g?.subject_id===s.id?'selected':''}>${s.code} – ${s.title} (${s.course} ${s.year} ${s.sem})</option>`
  ).join('');

  modal(`
    <div class="m-head">
      <h3>${gradeId ? 'Edit' : 'Post'} Grade</h3>
      <button class="m-close" onclick="closeModal()">&#x2715;</button>
    </div>
    <div class="m-body">
      <div class="field"><label>Student</label><select id="gStu">${studentOptions}</select></div>
      <div class="field"><label>Subject</label><select id="gSub">${subjectOptions}</select></div>
      <div class="field-row">
        <div class="field"><label>Midterm (%)</label>
          <input id="gM" type="number" min="0" max="100" value="${g?.midterm??''}" oninput="autoGrade()">
        </div>
        <div class="field"><label>Finals (%)</label>
          <input id="gF" type="number" min="0" max="100" value="${g?.finals??''}" oninput="autoGrade()">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Final Grade (auto-computed)</label>
          <input id="gGrade" readonly value="${g?.grade?.toFixed(2)||''}" placeholder="Enter finals to compute"
            style="background:#f8f9fc;font-weight:700;font-size:1.05rem;color:var(--navy)">
        </div>
        <div class="field"><label>Remarks</label>
          <select id="gRemarks">${selectOptions(['','Passed','Failed','INC'],g?.remarks||'')}</select>
        </div>
      </div>
      <div class="field"><label>Semester</label>
        <select id="gSem">${selectOptions(SEMS,g?.sem)}</select>
      </div>
      <div id="mMsg">
        <p style="font-size:.73rem;color:var(--text3);margin-top:4px">
          Formula: Midterm 50% + Finals 50% — Final grade computed once Finals is entered.
        </p>
      </div>
    </div>
    <div class="m-foot">
      <button class="btn primary" id="saveGradeBtn" onclick="saveGrade('${gradeId||''}')">Save</button>
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
    </div>
  `);

  // Lock pre-filled fields in instructor flow
  if (prefill && !gradeId) {
    setTimeout(() => {
      const stuEl = getEl('gStu'), subEl = getEl('gSub'), semEl = getEl('gSem');
      if (stuEl) { stuEl.value = prefill.student_id; stuEl.disabled = true; }
      if (subEl) { subEl.value = prefill.subject_id; subEl.disabled = true; }
      if (semEl) { semEl.value = prefill.sem;         semEl.disabled = true; }
    }, 30);
  }
}

function autoGrade() {
  const finalsVal = val('gF');
  if (!finalsVal) { getEl('gGrade').value = ''; getEl('gRemarks').value = ''; return; }
  const midterm = Number(val('gM'));
  const finals  = Number(finalsVal);
  const avg     = midterm * 0.5 + finals * 0.5;
  const grade   = averageToGrade(avg);
  getEl('gGrade').value   = grade.toFixed(2);
  getEl('gRemarks').value = grade <= 3.00 ? 'Passed' : 'Failed';
}

function averageToGrade(avg) {
  if (avg >= 97) return 1.00;
  if (avg >= 94) return 1.25;
  if (avg >= 91) return 1.50;
  if (avg >= 88) return 1.75;
  if (avg >= 85) return 2.00;
  if (avg >= 82) return 2.25;
  if (avg >= 79) return 2.50;
  if (avg >= 76) return 2.75;
  if (avg >= 75) return 3.00;
  return 5.00;
}

async function saveGrade(gradeId) {
  const studentId = val('gStu');
  const subjectId = val('gSub');
  const sem       = val('gSem');
  const midterm   = val('gM') !== '' ? Number(val('gM')) : null;
  const finals    = val('gF') !== '' ? Number(val('gF')) : null;
  const gradeStr  = val('gGrade');
  const remarks   = val('gRemarks') || null;

  if (midterm === null) { setMsg('mMsg','err','Enter at least a Midterm score.'); return; }

  const grade = gradeStr ? parseFloat(gradeStr) : null;
  const entry = { student_id: studentId, subject_id: subjectId, sem, midterm, finals, grade, remarks };

  const btn = getEl('saveGradeBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    if (gradeId) {
      await db.update('csams_grades', `id=eq.${gradeId}`, entry);
      toast('Grade updated.');
    } else {
      // Check for duplicate (student + subject + sem)
      const existing = await db.select('csams_grades',
        `student_id=eq.${studentId}&subject_id=eq.${subjectId}&sem=eq.${encodeURIComponent(sem)}`
      );
      if (existing.length > 0) {
        setMsg('mMsg','err','Grade already exists for this student/subject/semester. Edit the existing record.');
        return;
      }
      await db.insert('csams_grades', entry);
      toast('Grade posted.');
    }
    invalidate('csams_grades');
    closeModal();
    currentUser.role === 'instructor' ? myclasses() : grades();
  } catch (err) {
    setMsg('mMsg','err','Error: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Save';
  }
}

async function delGrade(gradeId) {
  if (!confirm('Delete this grade entry?')) return;
  try {
    await db.delete('csams_grades', `id=eq.${gradeId}`);
    invalidate('csams_grades');
    toast('Grade deleted.');
    currentUser.role === 'instructor' ? myclasses() : grades();
  } catch (err) {
    toast('Delete failed: ' + err.message, 'err');
  }
}

// ================================================================
//  MY CLASSES (instructor only)
// ================================================================
async function myclasses() {
  renderLoading();
  try {
    const [assignments, subjects, students] = await Promise.all([
      db.select('csams_assignments', `instructor_id=eq.${currentUser.instructorId}`),
      load('csams_subjects'),
      load('csams_students')
    ]);

    if (assignments.length === 0) {
      render(`
        ${pageHeader('My Classes', 'Your assigned classes')}
        <div style="padding:0 26px">
          <div class="card">
            <div class="card-body"><p style="color:var(--text3);text-align:center;padding:24px">No class assignments yet. Contact the administrator.</p></div>
          </div>
        </div>
      `);
      return;
    }

    const blocks = assignments.map(assign => {
      const sub = subjects.find(s => s.id === assign.subject_id);
      if (!sub) return '';

      // Students in this assignment's class
      const classStudents = students.filter(s =>
        s.course === assign.course && s.year === assign.year && s.section === assign.section
      );

      const gradeList = _cache['csams_grades'] || [];

      const rows = classStudents.map(st => {
        const g = gradeList.find(x => x.student_id === st.id && x.subject_id === assign.subject_id && x.sem === assign.sem);
        const finalGrade  = g?.finals != null ? (g.grade?.toFixed(2)||'—') : '—';
        const remarksHTML = g?.finals != null && g?.remarks
          ? `<span class="badge ${g.remarks}">${g.remarks}</span>` : '—';
        const hasGrade = !!g;
        return `
          <tr>
            <td>${st.name}</td>
            <td><span class="pill">${st.id}</span></td>
            <td>${g?.midterm ?? '—'}</td>
            <td>${g?.finals  ?? '—'}</td>
            <td><b style="font-family:var(--fh);font-size:1.1rem">${finalGrade}</b></td>
            <td>${remarksHTML}</td>
            <td>
              <button class="btn sm ${hasGrade?'ghost':'primary'}"
                onclick="instrPostGrade('${st.id}','${sub.id}','${assign.sem}')">
                ${hasGrade ? 'Edit' : 'Post Grade'}
              </button>
              ${hasGrade ? `<button class="btn sm danger" onclick="delGrade('${g.id}')">Del</button>` : ''}
            </td>
          </tr>`;
      }).join('') || `<tr><td colspan="7" class="empty">No students in this class.</td></tr>`;

      return `
        <div style="margin-bottom:24px">
          <div class="card">
            <div class="card-head">
              ${sub.code} — ${sub.title} &nbsp;|&nbsp; ${assign.course} ${assign.year} §${assign.section} &nbsp;|&nbsp; ${assign.sem}
            </div>
            <div class="card-body" style="padding:0">
              <div class="mg-tbl-wrap" style="overflow-x:auto">
                <table style="width:100%;border-collapse:collapse;min-width:480px">
                  <thead><tr>
                    <th style="${TH}">Student</th>
                    <th style="${TH}">ID</th>
                    <th style="${TH}">Midterm</th>
                    <th style="${TH}">Finals</th>
                    <th style="${TH}">Final Grade</th>
                    <th style="${TH}">Remarks</th>
                    <th style="${TH}">Actions</th>
                  </tr></thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');

    render(`
      ${pageHeader('My Classes', 'Your assigned classes and grades')}
      <div style="padding:0 26px">${blocks}</div>
    `);
  } catch (err) {
    render(`<div style="padding:26px"><div class="msg err">Error: ${err.message}</div></div>`);
  }
}

// Load grades for instructor view, then open modal
async function instrPostGrade(studentId, subjectId, sem) {
  if (!_cache['csams_grades']) {
    _cache['csams_grades'] = await db.select('csams_grades', '');
  }
  const existing = _cache['csams_grades'].find(g =>
    g.student_id === studentId && g.subject_id === subjectId && g.sem === sem
  );
  openGradeModal(existing ? existing.id : null, existing ? null : { student_id: studentId, subject_id: subjectId, sem });
}

// ================================================================
//  MY GRADES (student only)
// ================================================================
async function mygrades() {
  renderLoading();
  try {
    const [myGradeList, allSubjects, myRecord, allAssignments, allInstructors] = await Promise.all([
      db.select('csams_grades', `student_id=eq.${currentUser.studentId}`),
      load('csams_subjects'),
      db.select('csams_students', `id=eq.${currentUser.studentId}`),
      db.select('csams_assignments', ''),
      db.select('csams_instructors', '')
    ]);

    const me = myRecord[0] || null;
    if (!me) {
      render(`${pageHeader('My Grades','Your academic record')}<div style="padding:26px"><div class="msg err">Student record not found.</div></div>`);
      return;
    }

    // Get user info for instructors (to get their names)
    const instrUserIds = allInstructors.map(i => i.user_id).filter(Boolean);
    let userNames = {};
    if (instrUserIds.length > 0) {
      const users = await db.select('csams_users', `id=in.(${instrUserIds.join(',')})&select=id,name`);
      users.forEach(u => { userNames[u.id] = u.name; });
    }
    // Map instructor id → name
    const instrMap = {};
    allInstructors.forEach(i => { instrMap[i.id] = userNames[i.user_id] || i.name; });

    function getInstructor(subjectId, sem) {
      const match = allAssignments.find(a =>
        a.subject_id === subjectId && a.section === me.section &&
        a.course === me.course && a.year === me.year && a.sem === sem
      );
      return match ? (instrMap[match.instructor_id] || '—') : '—';
    }

    const enrolledSubs = allSubjects.filter(s => s.course === me.course && s.year === me.year);
    const semSet = new Set();
    myGradeList.forEach(g => semSet.add(g.sem || 'Unknown'));
    enrolledSubs.forEach(s => semSet.add(s.sem));
    const allSems = [...semSet].sort();

    const semesterBlocks = allSems.map(sem => {
      const semSubs   = enrolledSubs.filter(s => s.sem === sem);
      const semGrades = myGradeList.filter(g => (g.sem || 'Unknown') === sem);
      const gradedSubIds = semGrades.map(g => g.subject_id);

      const gradedRows = semGrades.map(g => {
        const subject     = allSubjects.find(s => s.id === g.subject_id);
        const finalGrade  = g.finals != null ? (g.grade?.toFixed(2)||'—') : '—';
        const remarksHTML = g.finals != null && g.remarks
          ? `<span class="badge ${g.remarks}">${g.remarks}</span>`
          : '<span style="color:var(--text3)">—</span>';
        const instrName = getInstructor(g.subject_id, g.sem);
        return `
          <tr class="mg-row" style="border-bottom:1px solid var(--border-l)">
            <td style="${TD}" data-label="Subject">
              <b>${subject?.title || g.subject_id}</b><br>
              <small style="color:var(--text3)">${subject?.code||''} · ${subject?.units||'—'} units</small>
            </td>
            <td style="${TD}" data-label="Midterm">${g.midterm ?? '—'}</td>
            <td style="${TD}" data-label="Finals">${g.finals  ?? '—'}</td>
            <td style="${TD}" data-label="Final Grade">
              <b style="font-family:var(--fh);font-size:1.2rem;color:var(--navy)">${finalGrade}</b>
            </td>
            <td style="${TD}" data-label="Remarks">${remarksHTML}</td>
            <td style="${TD};color:var(--text2);font-size:.8rem" data-label="Instructor">${instrName}</td>
          </tr>`;
      });

      const ungradedRows = semSubs.filter(s => !gradedSubIds.includes(s.id)).map(s => {
        const instrName = getInstructor(s.id, sem);
        return `
          <tr class="mg-row" style="border-bottom:1px solid var(--border-l);opacity:.75">
            <td style="${TD}" data-label="Subject">
              <b>${s.title}</b><br>
              <small style="color:var(--text3)">${s.code} · ${s.units} units</small>
            </td>
            <td style="${TD};color:var(--text3)" data-label="Midterm">—</td>
            <td style="${TD};color:var(--text3)" data-label="Finals">—</td>
            <td style="${TD};color:var(--text3)" data-label="Final Grade">—</td>
            <td style="${TD}" data-label="Remarks">
              <span class="badge" style="background:#f4f5f7;color:var(--text3);border:1px solid var(--border);white-space:nowrap">Not Yet Graded</span>
            </td>
            <td style="${TD};color:var(--text2);font-size:.8rem" data-label="Instructor">${instrName}</td>
          </tr>`;
      });

      const allRows = [...gradedRows, ...ungradedRows].join('');
      if (!allRows) return '';

      return `
        <div style="margin-bottom:24px">
          <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.8px;color:var(--text3);margin-bottom:8px;font-weight:600;padding:0 2px">${sem}</div>
          <div class="mg-tbl-wrap">
            <table class="mg-table" style="width:100%;border-collapse:collapse">
              <thead><tr>
                <th style="${TH}">Subject</th>
                <th style="${TH}">Midterm</th>
                <th style="${TH}">Finals</th>
                <th style="${TH}">Final Grade</th>
                <th style="${TH}">Remarks</th>
                <th style="${TH}">Instructor</th>
              </tr></thead>
              <tbody>${allRows}</tbody>
            </table>
          </div>
        </div>`;
    }).join('');

    const gwa = computeGWAFromList(myGradeList, allSubjects);
    const hasContent = enrolledSubs.length > 0 || myGradeList.length > 0;
    const gwaDisplay = myGradeList.some(g => g.finals != null && g.grade) ? `
      <div style="margin-top:12px;padding-top:14px;border-top:2px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <span style="font-weight:600;color:var(--text2)">General Weighted Average</span>
        <span style="font-family:var(--fh);font-size:1.8rem;font-weight:700;color:var(--navy)">${gwa}</span>
      </div>` : '';

    render(`
      <style>
        .mg-tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:var(--r);border:1px solid var(--border)}
        @media(max-width:600px){
          .mg-table thead{display:none}
          .mg-table,.mg-table tbody,.mg-row,.mg-row td{display:block;width:100%}
          .mg-row{padding:10px 14px;border-bottom:1px solid var(--border)!important;position:relative}
          .mg-row:last-child{border-bottom:none!important}
          .mg-row td{display:flex;align-items:center;justify-content:space-between;padding:4px 0!important;font-size:.82rem;border:none!important;min-height:26px}
          .mg-row td::before{content:attr(data-label);font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text3);flex-shrink:0;margin-right:10px;min-width:80px}
          .mg-row td b[style*="font-family"]{font-size:1.1rem}
          .mg-row td:first-child{display:block;padding-bottom:8px!important;border-bottom:1px solid var(--border-l)!important;margin-bottom:4px}
          .mg-row td:first-child::before{display:none}
        }
      </style>
      ${pageHeader('My Grades', 'Your academic record')}
      <div style="padding:0 26px">
        <div class="card">
          <div class="card-head">${currentUser.name} — ${me.course} ${me.year} §${me.section}</div>
          <div class="card-body">
            ${!hasContent ? '<p style="color:var(--text3);text-align:center;padding:20px">No subjects or grades available yet.</p>' : semesterBlocks}
            ${gwaDisplay}
          </div>
        </div>
      </div>
    `);
  } catch (err) {
    render(`<div style="padding:26px"><div class="msg err">Error: ${err.message}</div></div>`);
  }
}

// ================================================================
//  GWA CALCULATOR
// ================================================================
function computeGWAFromList(gradeList, subjects = null) {
  const completed = gradeList.filter(g => g.finals != null && g.grade);
  if (completed.length === 0) return '—';

  let totalUnits = 0, weightedSum = 0;
  completed.forEach(g => {
    const sub   = (subjects || _cache['csams_subjects'] || []).find(s => s.id === g.subject_id);
    const units = sub?.units || 3;
    totalUnits  += units;
    weightedSum += g.grade * units;
  });
  return (weightedSum / totalUnits).toFixed(2);
}

// ================================================================
//  DOM HELPERS
// ================================================================
function getEl(id)  { return document.getElementById(id); }
function val(id)    { return getEl(id)?.value || ''; }
function show(id)   { getEl(id)?.classList.remove('hidden'); }
function hide(id)   { getEl(id)?.classList.add('hidden'); }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function toAttr(obj) { return JSON.stringify(obj).replace(/'/g, '&apos;'); }

function switchScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  getEl(id).classList.add('active');
}

function render(html) { getEl('content').innerHTML = html; }

function modal(html) {
  getEl('modal').classList.remove('hidden');
  getEl('modalBox').innerHTML = html;
}
function closeModal(event) {
  if (!event || event.target === getEl('modal')) {
    getEl('modal').classList.add('hidden');
    getEl('modalBox').innerHTML = '';
  }
}

function setMsg(elementId, type, message) {
  const el = getEl(elementId);
  if (!el) return;
  el.className = `msg ${type}`;
  el.textContent = message;
}

function toggleSidebar() { getEl('sidebar').classList.toggle('open'); }

// ================================================================
//  TABLE HELPERS
// ================================================================
function filterTable(input, tableId) {
  const q = input.value.toLowerCase();
  document.querySelectorAll(`#${tableId} tbody tr`).forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

function filterByAttr(select, tableId, attr) {
  const v = select.value;
  document.querySelectorAll(`#${tableId} tbody tr`).forEach(row => {
    row.style.display = (!v || row.dataset[attr] === v) ? '' : 'none';
  });
}

const sortState = {};
function sortTable(tableId, colIndex) {
  const table = getEl(tableId);
  if (!table) return;
  const key = tableId + ':' + colIndex;
  sortState[key] = sortState[key] === 'asc' ? 'desc' : 'asc';
  const dir = sortState[key];
  const rows = [...table.querySelectorAll('tbody tr')];
  rows.sort((a, b) => {
    const aT = a.cells[colIndex]?.textContent.trim() || '';
    const bT = b.cells[colIndex]?.textContent.trim() || '';
    const aN = parseFloat(aT), bN = parseFloat(bT);
    if (!isNaN(aN) && !isNaN(bN)) return dir==='asc' ? aN-bN : bN-aN;
    return dir==='asc' ? aT.localeCompare(bT) : bT.localeCompare(aT);
  });
  const tbody = table.querySelector('tbody');
  rows.forEach(r => tbody.appendChild(r));
  table.querySelectorAll('th.sortable-th').forEach(th => {
    const label = th.textContent.replace(/\s*[▲▼⇅]$/,'').trim();
    const thCol = th.getAttribute('onclick')?.match(/(\d+)\)/)?.[1];
    if (thCol && Number(thCol) === colIndex) {
      th.textContent = label + ' ' + (dir==='asc' ? '▲' : '▼');
    } else if (!th.textContent.match(/[▲▼]/)) {
      th.textContent = label + ' ⇅';
    }
  });
}

// ================================================================
//  HTML BUILDER HELPERS
// ================================================================
function pageHeader(title, subtitle) {
  return `<div class="ph"><div><h2>${title}</h2><p>${subtitle}</p></div></div>`;
}

function statCard(colorClass, label, number, sub) {
  return `<div class="sc ${colorClass}">
    <div class="sc-lbl">${label}</div>
    <div class="sc-num">${number}</div>
    <div class="sc-sub">${sub}</div>
  </div>`;
}

function selectOptions(items, selectedValue = '') {
  return items.map(item => {
    const value = Array.isArray(item) ? item[0] : item;
    const label = Array.isArray(item) ? item[1] : item;
    return `<option value="${value}" ${value===selectedValue?'selected':''}>${label}</option>`;
  }).join('');
}

function filterOptions(allLabel, pairs) {
  return `<option value="">${allLabel}</option>` +
    pairs.map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
}

function filterSelect(onchange, allLabel, pairs) {
  return `<select onchange="${onchange}" style="${SEL}">${filterOptions(allLabel,pairs)}</select>`;
}

const SEL = 'border:1px solid var(--border);border-radius:var(--r);padding:7px 10px;font-family:var(--ff);font-size:.82rem;background:var(--surface)';
const TH  = 'padding:9px 13px;text-align:left;font-size:.7rem;text-transform:uppercase;letter-spacing:.6px;color:var(--text2);font-weight:600;border-bottom:2px solid var(--border);background:#f8f9fc';
const TD  = 'padding:9px 13px;font-size:.82rem';
