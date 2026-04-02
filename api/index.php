<?php
// index.php — Project root entry point
// Railway runs: php -S 0.0.0.0:$PORT index.php
// This file routes every request correctly.

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri = rawurldecode($uri);

// ── API requests → api/index.php ─────────────────────────────────────────────
if (strpos($uri, '/api') === 0) {
    require __DIR__ . '/api/index.php';
    exit;
}

// ── Static files (css, js, images) ───────────────────────────────────────────
$candidates = [
    __DIR__ . $uri,
    __DIR__ . '/public' . $uri,
];

foreach ($candidates as $file) {
    if (is_file($file)) {
        $ext  = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        $mime = [
            'html' => 'text/html; charset=utf-8',
            'css'  => 'text/css',
            'js'   => 'application/javascript',
            'json' => 'application/json',
            'png'  => 'image/png',
            'jpg'  => 'image/jpeg',
            'ico'  => 'image/x-icon',
            'svg'  => 'image/svg+xml',
            'woff2'=> 'font/woff2',
        ][$ext] ?? 'application/octet-stream';

        header('Content-Type: ' . $mime);
        readfile($file);
        exit;
    }
}

// ── Everything else → frontend ───────────────────────────────────────────────
header('Content-Type: text/html; charset=utf-8');
readfile(__DIR__ . '/public/index.html');
exit;
