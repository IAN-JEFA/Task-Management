<?php
// api/index.php — REST API router

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204); exit;
}

require_once __DIR__ . '/../models/Task.php';

// ── Helpers ───────────────────────────────────────────────────────────────────

function respond(int $code, array $data): void {
    http_response_code($code);
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

function bodyJson(): array {
    $raw = file_get_contents('php://input');
    $dec = json_decode($raw, true);
    return is_array($dec) ? $dec : [];
}

// ── Path detection ────────────────────────────────────────────────────────────
// ?_path=tasks/1/status  ← sent by app.js (most reliable, works everywhere)
// PATH_INFO              ← PHP built-in server fallback
// REQUEST_URI            ← Apache fallback

$method = $_SERVER['REQUEST_METHOD'];

if (!empty($_GET['_path'])) {
    $path = '/' . ltrim($_GET['_path'], '/');
} elseif (!empty($_SERVER['PATH_INFO'])) {
    $path = $_SERVER['PATH_INFO'];
} else {
    $uri  = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $path = preg_replace('#^.*/api(?:/index\.php)?#', '', $uri);
}

$path = rtrim($path, '/') ?: '/';

// ── POST /tasks ───────────────────────────────────────────────────────────────
if ($method === 'POST' && $path === '/tasks') {
    $body   = bodyJson();
    $errors = [];

    if (empty($body['title']) || !is_string($body['title']))
        $errors['title'] = 'Title is required.';

    $today = date('Y-m-d');
    if (empty($body['due_date'])) {
        $errors['due_date'] = 'due_date is required.';
    } elseif (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $body['due_date'])) {
        $errors['due_date'] = 'due_date must be YYYY-MM-DD.';
    } elseif ($body['due_date'] < $today) {
        $errors['due_date'] = 'due_date must be today or a future date.';
    }

    if (empty($body['priority'])) {
        $errors['priority'] = 'Priority is required.';
    } elseif (!in_array($body['priority'], Task::VALID_PRIORITIES, true)) {
        $errors['priority'] = 'Priority must be low, medium, or high.';
    }

    if ($errors) respond(422, ['errors' => $errors]);

    if (!empty($body['title']) && !empty($body['due_date']) &&
        Task::existsByTitleAndDate(trim($body['title']), $body['due_date'])) {
        respond(409, ['error' => 'A task with this title already exists for that due_date.']);
    }

    $task = Task::create([
        'title'    => trim($body['title']),
        'due_date' => $body['due_date'],
        'priority' => $body['priority'],
    ]);
    respond(201, ['message' => 'Task created.', 'task' => $task]);
}

// ── GET /tasks/report ─────────────────────────────────────────────────────────
if ($method === 'GET' && $path === '/tasks/report') {
    $date = $_GET['date'] ?? null;
    if (!$date || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date))
        respond(422, ['error' => 'Provide ?date=YYYY-MM-DD']);
    respond(200, ['date' => $date, 'summary' => Task::reportByDate($date)]);
}

// ── GET /tasks ────────────────────────────────────────────────────────────────
if ($method === 'GET' && $path === '/tasks') {
    $status = $_GET['status'] ?? null;
    if ($status !== null && !in_array($status, Task::VALID_STATUSES, true))
        respond(422, ['error' => 'status must be pending, in_progress, or done.']);
    $tasks = Task::all($status);
    respond(200, empty($tasks)
        ? ['message' => 'No tasks found.', 'tasks' => []]
        : ['tasks' => $tasks, 'count' => count($tasks)]
    );
}

// ── PATCH /tasks/{id}/status ──────────────────────────────────────────────────
if ($method === 'PATCH' && preg_match('#^/tasks/(\d+)/status$#', $path, $m)) {
    $id   = (int)$m[1];
    $task = Task::findById($id);
    if (!$task) respond(404, ['error' => "Task {$id} not found."]);

    $body      = bodyJson();
    $newStatus = $body['status'] ?? null;
    if (!$newStatus) respond(422, ['error' => 'status field is required.']);

    $allowed = Task::getNextStatus($task['status']);
    if ($newStatus !== $allowed) {
        respond(422, [
            'error'   => $allowed
                ? "Must transition to '{$allowed}', not '{$newStatus}'."
                : "Task is already 'done'.",
            'current' => $task['status'],
            'allowed' => $allowed,
        ]);
    }

    respond(200, ['message' => 'Status updated.', 'task' => Task::updateStatus($id, $newStatus)]);
}

// ── DELETE /tasks/{id} ────────────────────────────────────────────────────────
if ($method === 'DELETE' && preg_match('#^/tasks/(\d+)$#', $path, $m)) {
    $id   = (int)$m[1];
    $task = Task::findById($id);
    if (!$task) respond(404, ['error' => "Task {$id} not found."]);
    if ($task['status'] !== 'done')
        respond(403, ['error' => 'Only done tasks can be deleted.']);
    Task::delete($id);
    respond(200, ['message' => "Task {$id} deleted."]);
}

// ── 404 ───────────────────────────────────────────────────────────────────────
respond(404, ['error' => 'Endpoint not found.', 'path' => $path, 'method' => $method]);
