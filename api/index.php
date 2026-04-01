<?php
// api/index.php  — Main API Router

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../models/Task.php';

// ── Helper functions ──────────────────────────────────────────────────────────

function respond(int $code, array $data): void {
    http_response_code($code);
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

function bodyJson(): array {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? [];
}

// ── Route parsing ─────────────────────────────────────────────────────────────

$method     = $_SERVER['REQUEST_METHOD'];
$requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Strip everything up to and including /api (handles subfolders like /taskmanager/api/tasks)
// e.g. /taskmanager/api/tasks  →  /tasks
//      /api/tasks              →  /tasks
//      /tasks                  →  /tasks  (direct PHP server)
$path = preg_replace('#^.*/api#', '', $requestUri);
$path = rtrim($path, '/') ?: '/';

// Match routes:
// GET    /tasks
// GET    /tasks/report
// POST   /tasks
// PATCH  /tasks/{id}/status
// DELETE /tasks/{id}

// ── POST /tasks ───────────────────────────────────────────────────────────────
if ($method === 'POST' && $path === '/tasks') {
    $body = bodyJson();

    // Validation
    $errors = [];

    if (empty($body['title']) || !is_string($body['title'])) {
        $errors['title'] = 'Title is required.';
    }

    $today = date('Y-m-d');
    if (empty($body['due_date'])) {
        $errors['due_date'] = 'due_date is required.';
    } elseif (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $body['due_date']) || !strtotime($body['due_date'])) {
        $errors['due_date'] = 'due_date must be a valid date (YYYY-MM-DD).';
    } elseif ($body['due_date'] < $today) {
        $errors['due_date'] = 'due_date must be today or a future date.';
    }

    if (empty($body['priority'])) {
        $errors['priority'] = 'Priority is required.';
    } elseif (!in_array($body['priority'], Task::VALID_PRIORITIES, true)) {
        $errors['priority'] = 'Priority must be low, medium, or high.';
    }

    if ($errors) {
        respond(422, ['errors' => $errors]);
    }

    // Duplicate check
    if (Task::existsByTitleAndDate($body['title'], $body['due_date'])) {
        respond(409, ['error' => 'A task with this title already exists for the given due_date.']);
    }

    $task = Task::create([
        'title'    => trim($body['title']),
        'due_date' => $body['due_date'],
        'priority' => $body['priority'],
    ]);

    respond(201, ['message' => 'Task created successfully.', 'task' => $task]);
}

// ── GET /tasks/report ─────────────────────────────────────────────────────────
if ($method === 'GET' && $path === '/tasks/report') {
    $date = $_GET['date'] ?? null;
    if (!$date || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !strtotime($date)) {
        respond(422, ['error' => 'Provide a valid ?date=YYYY-MM-DD query parameter.']);
    }
    $summary = Task::reportByDate($date);
    respond(200, ['date' => $date, 'summary' => $summary]);
}

// ── GET /tasks ────────────────────────────────────────────────────────────────
if ($method === 'GET' && $path === '/tasks') {
    $status = $_GET['status'] ?? null;
    if ($status !== null && !in_array($status, Task::VALID_STATUSES, true)) {
        respond(422, ['error' => 'status must be one of: pending, in_progress, done.']);
    }
    $tasks = Task::all($status);
    if (empty($tasks)) {
        respond(200, ['message' => 'No tasks found.', 'tasks' => []]);
    }
    respond(200, ['tasks' => $tasks, 'count' => count($tasks)]);
}

// ── PATCH /tasks/{id}/status ──────────────────────────────────────────────────
if ($method === 'PATCH' && preg_match('#^/tasks/(\d+)/status$#', $path, $m)) {
    $id   = (int)$m[1];
    $task = Task::findById($id);
    if (!$task) {
        respond(404, ['error' => "Task with id {$id} not found."]);
    }

    $body      = bodyJson();
    $newStatus = $body['status'] ?? null;

    if (!$newStatus) {
        respond(422, ['error' => 'status field is required.']);
    }

    $allowed = Task::getNextStatus($task['status']);
    if ($newStatus !== $allowed) {
        if ($allowed === null) {
            respond(422, ['error' => "Task is already 'done' and cannot be updated further."]);
        }
        respond(422, [
            'error'   => "Invalid status transition. Current status is '{$task['status']}'; next allowed status is '{$allowed}'.",
            'current' => $task['status'],
            'allowed' => $allowed,
        ]);
    }

    $updated = Task::updateStatus($id, $newStatus);
    respond(200, ['message' => 'Task status updated.', 'task' => $updated]);
}

// ── DELETE /tasks/{id} ────────────────────────────────────────────────────────
if ($method === 'DELETE' && preg_match('#^/tasks/(\d+)$#', $path, $m)) {
    $id   = (int)$m[1];
    $task = Task::findById($id);
    if (!$task) {
        respond(404, ['error' => "Task with id {$id} not found."]);
    }
    if ($task['status'] !== 'done') {
        respond(403, ['error' => 'Only tasks with status "done" can be deleted.']);
    }
    Task::delete($id);
    respond(200, ['message' => "Task {$id} deleted successfully."]);
}

// ── 404 fallback ──────────────────────────────────────────────────────────────
respond(404, ['error' => 'Endpoint not found.', 'path' => $path, 'method' => $method]);