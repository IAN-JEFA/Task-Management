// app.js — TaskFlow Frontend

// ── API config ────────────────────────────────────────────────────────────────
// Builds the URL to api/index.php using ?_path= so routing works on
// every server (XAMPP, PHP built-in, Railway) without needing .htaccess.
const _origin  = window.location.origin;
const _base    = '';
const _apiFile = 'https://taskmanager-production-68de.up.railway.app/api/index.php';

// Use PORT provided in environment or default to 3000
const port = process.env.PORT || 3000;
// Listen on `port` and 0.0.0.0
app.listen(port, "0.0.0.0", function () {
  // ...
});
function apiUrl(route, extra = {}) {
    // route: '/tasks'  '/tasks/report'  '/tasks/5/status'  '/tasks/5'
    const params = new URLSearchParams({ _path: route.replace(/^\//, ''), ...extra });
    return `${_apiFile}?${params}`;
}

// ── State ─────────────────────────────────────────────────────────────────────
let currentFilter = '';
let _cache        = {};   // id → task, populated after every load

// ── DOM ───────────────────────────────────────────────────────────────────────
const taskGrid   = document.getElementById('taskGrid');
const taskCount  = document.getElementById('taskCount');
const createForm = document.getElementById('createForm');
const toast      = document.getElementById('toast');
const $          = id => document.getElementById(id);

// ── Helpers ───────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    toast.textContent = msg;
    toast.className   = `toast show ${type}`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('show'), 3500);
}
function openModal(id)  { $(id).classList.add('open');    }
function closeModal(id) { $(id).classList.remove('open'); }
function escHtml(s)     { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function formatDate(s)  {
    if (!s) return '';
    const [y,m,d] = s.split('-');
    return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]} ${+d}, ${y}`;
}
function isOverdue(d)     { return d < new Date().toISOString().slice(0,10); }
function priorityLabel(p) { return {high:'🔴 High',medium:'🟡 Medium',low:'🟢 Low'}[p] || p; }
function statusLabel(s)   { return {pending:'Pending',in_progress:'In Progress',done:'Done'}[s] || s; }

// ── Fetch wrapper (never throws) ──────────────────────────────────────────────
async function apiFetch(route, options = {}, queryExtra = {}) {
    const url = apiUrl(route, queryExtra);
    try {
        const res  = await fetch(url, {
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            ...options,
        });
        const data = await res.json();
        return { ok: res.ok, status: res.status, data };
    } catch (err) {
        console.error('apiFetch error:', err, url);
        return {
            ok: false, status: 0,
            data: { error: `Cannot reach server. Is PHP running? (${err.message})` },
        };
    }
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderTasks(tasks) {
    _cache = {};
    (tasks || []).forEach(t => (_cache[t.id] = t));

    if (!tasks || !tasks.length) {
        taskGrid.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📭</div>
            <h3>No tasks here yet</h3>
            <p>Click "+ New Task" to create one.</p>
          </div>`;
        taskCount.textContent = '0 tasks';
        return;
    }

    taskCount.textContent = `${tasks.length} task${tasks.length !== 1 ? 's' : ''}`;
    taskGrid.innerHTML    = tasks.map(cardHtml).join('');

    taskGrid.querySelectorAll('[data-advance]').forEach(b =>
        b.addEventListener('click', () => advanceTask(+b.dataset.advance)));
    taskGrid.querySelectorAll('[data-delete]').forEach(b =>
        b.addEventListener('click', () => deleteTask(+b.dataset.delete)));
}

function cardHtml(t) {
    const overdue = isOverdue(t.due_date) && t.status !== 'done';
    const next    = { pending:'in_progress', in_progress:'done' }[t.status];
    const btnLabel= { pending:'Start →', in_progress:'Mark Done ✓' }[t.status] || '';
    return `
    <article class="task-card">
      <div class="card-top">
        <h3 class="card-title">${escHtml(t.title)}</h3>
        <span class="card-id">#${t.id}</span>
      </div>
      <div class="card-meta">
        <span class="badge badge--${t.priority}">${priorityLabel(t.priority)}</span>
        <span class="badge badge--${t.status}">${statusLabel(t.status)}</span>
        <span class="card-due ${overdue?'overdue':''}">📅 ${formatDate(t.due_date)}${overdue?' ⚠':''}</span>
      </div>
      <div class="card-actions">
        ${next ? `<button class="btn btn--sm btn--advance" data-advance="${t.id}">${btnLabel}</button>` : ''}
        ${t.status === 'done' ? `<button class="btn btn--sm btn--danger" data-delete="${t.id}">Delete</button>` : ''}
      </div>
    </article>`;
}

// ── Load tasks ────────────────────────────────────────────────────────────────
async function loadTasks() {
    taskGrid.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';
    const extra = currentFilter ? { status: currentFilter } : {};
    const { ok, data } = await apiFetch('/tasks', {}, extra);
    if (ok) {
        renderTasks(data.tasks || []);
    } else {
        taskGrid.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <h3>Failed to load tasks</h3>
            <p>${escHtml(data.error || 'Unknown error')}</p>
          </div>`;
        taskCount.textContent = '';
    }
}

// ── Create task ───────────────────────────────────────────────────────────────
createForm.addEventListener('submit', async e => {
    e.preventDefault();
    ['title','due_date','priority'].forEach(f => { $(`err-${f}`).textContent = ''; });
    const errBox = $('createFormError');
    errBox.classList.remove('visible');

    const body = {
        title:    $('f-title').value.trim(),
        due_date: $('f-due_date').value,
        priority: $('f-priority').value,
    };

    const btn = $('createSubmitBtn');
    btn.disabled = true; btn.textContent = 'Creating…';

    const { ok, data } = await apiFetch('/tasks', { method:'POST', body:JSON.stringify(body) });
    btn.disabled = false; btn.textContent = 'Create Task';

    if (ok) {
        closeModal('createModal');
        createForm.reset();
        showToast('Task created!', 'success');
        loadTasks();
    } else if (data.errors) {
        Object.entries(data.errors).forEach(([k,v]) => {
            const el = $(`err-${k}`);
            if (el) el.textContent = v;
        });
    } else {
        errBox.textContent = data.error || 'Something went wrong.';
        errBox.classList.add('visible');
    }
});

// ── Advance status ────────────────────────────────────────────────────────────
async function advanceTask(id) {
    const task = _cache[id];
    if (!task) return;
    const next = { pending:'in_progress', in_progress:'done' }[task.status];
    if (!next) return;

    const { ok, data } = await apiFetch(
        `/tasks/${id}/status`,
        { method:'PATCH', body:JSON.stringify({ status:next }) }
    );
    if (ok) { showToast(`Moved to "${statusLabel(next)}"`, 'success'); loadTasks(); }
    else      showToast(data.error || 'Update failed', 'error');
}

// ── Delete task ───────────────────────────────────────────────────────────────
async function deleteTask(id) {
    if (!confirm('Delete this completed task?')) return;
    const { ok, data } = await apiFetch(`/tasks/${id}`, { method:'DELETE' });
    if (ok) { showToast('Task deleted.', 'success'); loadTasks(); }
    else      showToast(data.error || 'Delete failed', 'error');
}

// ── Daily report ──────────────────────────────────────────────────────────────
$('fetchReportBtn').addEventListener('click', async () => {
    const date = $('reportDate').value;
    if (!date) { showToast('Select a date first', 'error'); return; }

    const { ok, data } = await apiFetch('/tasks/report', {}, { date });
    const out = $('reportOutput');

    if (!ok) { out.innerHTML = `<p style="color:var(--high)">${escHtml(data.error||'Error')}</p>`; return; }

    const s     = data.summary;
    const total = p => Object.values(s[p]).reduce((a,b)=>a+b, 0);

    out.innerHTML = `
    <p style="font-size:.75rem;color:var(--muted);margin-bottom:1rem">
      Report for <strong style="color:var(--text)">${data.date}</strong>
    </p>
    <table class="report-table">
      <thead><tr><th>Priority</th><th>Pending</th><th>In Progress</th><th>Done</th><th>Total</th></tr></thead>
      <tbody>
        ${['high','medium','low'].map(p=>`
        <tr>
          <td><span class="badge badge--${p}">${priorityLabel(p)}</span></td>
          <td class="num ${s[p].pending    ?'nonzero':''}">${s[p].pending}</td>
          <td class="num ${s[p].in_progress?'nonzero':''}">${s[p].in_progress}</td>
          <td class="num ${s[p].done       ?'nonzero':''}">${s[p].done}</td>
          <td class="num" style="font-weight:600">${total(p)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
});

// ── UI event listeners ────────────────────────────────────────────────────────
$('openCreateBtn').addEventListener('click', () => {
    $('f-due_date').min = new Date().toISOString().slice(0,10);
    openModal('createModal');
});

$('reportBtn').addEventListener('click', () => {
    $('reportDate').value       = new Date().toISOString().slice(0,10);
    $('reportOutput').innerHTML = '';
    openModal('reportModal');
});

document.querySelectorAll('[data-close]').forEach(b =>
    b.addEventListener('click', () => closeModal(b.dataset.close)));

document.querySelectorAll('.modal-overlay').forEach(o =>
    o.addEventListener('click', e => { if (e.target === o) closeModal(o.id); }));

document.querySelectorAll('.nav-btn[data-status]').forEach(b =>
    b.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn[data-status]').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        currentFilter = b.dataset.status;
        loadTasks();
    }));

// ── Boot ──────────────────────────────────────────────────────────────────────
loadTasks();
