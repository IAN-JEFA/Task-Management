// app.js — Task Manager Frontend

// ── Config 
// Detect base path automatically — works for XAMPP subfolders and direct PHP server
const API_PHP = 'https://taskmanager-production-68de.up.railway.app/api/index.php';
// ── State 
let currentFilter = '';

// ── DOM Refs 
const taskGrid     = document.getElementById('taskGrid');
const taskCount    = document.getElementById('taskCount');
const createModal  = document.getElementById('createModal');
const reportModal  = document.getElementById('reportModal');
const createForm   = document.getElementById('createForm');
const toast        = document.getElementById('toast');

// ── Helpers 
const $ = id => document.getElementById(id);

function showToast(msg, type = 'success') {
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

async function api(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    ...options,
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

function formatDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[+m-1]} ${+d}, ${y}`;
}

function isOverdue(dueDate) {
  return dueDate < new Date().toISOString().slice(0,10);
}

function priorityLabel(p) {
  return { high: '🔴 High', medium: '🟡 Medium', low: '🟢 Low' }[p] || p;
}
function statusLabel(s) {
  return { pending: 'Pending', in_progress: 'In Progress', done: 'Done' }[s] || s;
}

// ── Render Tasks ──────────────────────────────────────────────────────────────
let _taskCache = {};

function renderTasks(tasks) {
  // Rebuild cache
  _taskCache = {};
  (tasks || []).forEach(t => { _taskCache[t.id] = t; });

  if (!tasks || tasks.length === 0) {
    taskGrid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <h3>No tasks here yet</h3>
        <p>Create a new task to get started.</p>
      </div>`;
    taskCount.textContent = '0 tasks';
    return;
  }
  taskCount.textContent = `${tasks.length} task${tasks.length !== 1 ? 's' : ''}`;
  taskGrid.innerHTML = tasks.map(renderCard).join('');

  // Bind action buttons
  taskGrid.querySelectorAll('[data-advance]').forEach(btn => {
    btn.addEventListener('click', () => advanceTask(+btn.dataset.advance));
  });
  taskGrid.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => deleteTask(+btn.dataset.delete));
  });
}

function renderCard(t) {
  const overdue = isOverdue(t.due_date) && t.status !== 'done';
  const nextStatus = { pending: 'in_progress', in_progress: 'done' }[t.status];
  const advanceLabel = { pending: 'Start →', in_progress: 'Mark Done ✓' }[t.status] || '';

  return `
  <article class="task-card">
    <div class="card-top">
      <h3 class="card-title">${escHtml(t.title)}</h3>
      <span class="card-id">#${t.id}</span>
    </div>
    <div class="card-meta">
      <span class="badge badge--${t.priority}">${priorityLabel(t.priority)}</span>
      <span class="badge badge--${t.status}">${statusLabel(t.status)}</span>
      <span class="card-due ${overdue ? 'overdue' : ''}">
        📅 ${formatDate(t.due_date)}${overdue ? ' ⚠' : ''}
      </span>
    </div>
    <div class="card-actions">
      ${nextStatus ? `<button class="btn btn--sm btn--advance" data-advance="${t.id}">${advanceLabel}</button>` : ''}
      ${t.status === 'done' ? `<button class="btn btn--sm btn--danger" data-delete="${t.id}">Delete</button>` : ''}
    </div>
  </article>`;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Load Tasks ────────────────────────────────────────────────────────────────
async function loadTasks() {
  taskGrid.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';
  const qs = currentFilter ? `?status=${currentFilter}` : '';
  const { ok, data } = await api(`/tasks${qs}`);
  if (ok) {
    renderTasks(data.tasks || []);
  } else {
    taskGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Failed to load tasks</h3><p>${data.error || 'Unknown error'}</p></div>`;
  }
}

// ── Create Task ───────────────────────────────────────────────────────────────
createForm.addEventListener('submit', async e => {
  e.preventDefault();
  // Clear errors
  ['title','due_date','priority'].forEach(f => { $(`err-${f}`).textContent = ''; });
  $('createFormError').classList.remove('visible');

  const body = {
    title:    $('f-title').value.trim(),
    due_date: $('f-due_date').value,
    priority: $('f-priority').value,
  };

  const submitBtn = $('createSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating…';

  const { ok, data } = await api('/tasks', { method: 'POST', body: JSON.stringify(body) });

  submitBtn.disabled = false;
  submitBtn.textContent = 'Create Task';

  if (ok) {
    closeModal('createModal');
    createForm.reset();
    showToast('Task created successfully!', 'success');
    loadTasks();
  } else {
    if (data.errors) {
      Object.entries(data.errors).forEach(([k, v]) => {
        const el = $(`err-${k}`);
        if (el) el.textContent = v;
      });
    } else {
      const el = $('createFormError');
      el.textContent = data.error || 'Something went wrong.';
      el.classList.add('visible');
    }
  }
});

// ── Advance Task Status ───────────────────────────────────────────────────────
async function advanceTask(id) {
  const nextMap = { pending: 'in_progress', in_progress: 'done' };
  const task = findTaskById(id);
  if (!task) return;
  const next = nextMap[task.status];
  if (!next) return;

  const { ok, data } = await api(`/tasks/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: next }),
  });

  if (ok) {
    showToast(`Task moved to "${statusLabel(next)}"`, 'success');
    loadTasks();
  } else {
    showToast(data.error || 'Failed to update status', 'error');
  }
}

function findTaskById(id) {
  return _taskCache[id];
}

// ── Delete Task ───────────────────────────────────────────────────────────────
async function deleteTask(id) {
  if (!confirm('Delete this completed task? This cannot be undone.')) return;
  const { ok, data } = await api(`/tasks/${id}`, { method: 'DELETE' });
  if (ok) {
    showToast('Task deleted.', 'success');
    loadTasks();
  } else {
    showToast(data.error || 'Failed to delete task', 'error');
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
$('fetchReportBtn').addEventListener('click', async () => {
  const date = $('reportDate').value;
  if (!date) { showToast('Please select a date', 'error'); return; }

  const { ok, data } = await api(`/tasks/report?date=${date}`);
  const out = $('reportOutput');
  if (!ok) {
    out.innerHTML = `<p style="color:var(--high)">${data.error || 'Error fetching report'}</p>`;
    return;
  }

  const s = data.summary;
  const total = p => Object.values(s[p]).reduce((a,b)=>a+b, 0);

  out.innerHTML = `
  <p style="font-size:.75rem;color:var(--text-muted);margin-bottom:1rem">Report for <strong style="color:var(--text)">${data.date}</strong></p>
  <table class="report-table">
    <thead>
      <tr>
        <th>Priority</th>
        <th>Pending</th>
        <th>In Progress</th>
        <th>Done</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${['high','medium','low'].map(p => `
      <tr>
        <td><span class="badge badge--${p}">${priorityLabel(p)}</span></td>
        <td class="num ${s[p].pending ? 'nonzero' : ''}">${s[p].pending}</td>
        <td class="num ${s[p].in_progress ? 'nonzero' : ''}">${s[p].in_progress}</td>
        <td class="num ${s[p].done ? 'nonzero' : ''}">${s[p].done}</td>
        <td class="num" style="font-weight:600">${total(p)}</td>
      </tr>`).join('')}
    </tbody>
  </table>`;
});

// ── Event Listeners ───────────────────────────────────────────────────────────
$('openCreateBtn').addEventListener('click', () => {
  // Set min date to today
  $('f-due_date').min = new Date().toISOString().slice(0, 10);
  openModal('createModal');
});

$('reportBtn').addEventListener('click', () => {
  $('reportDate').value = new Date().toISOString().slice(0, 10);
  $('reportOutput').innerHTML = '';
  openModal('reportModal');
});

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

document.querySelectorAll('.nav-btn[data-status]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn[data-status]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.status;
    loadTasks();
  });
});

// ── Init ──────────────────────────────────────────────────────────────────────
loadTasks();