<?php
// router.php — Used by PHP built-in server (Railway, Render, local dev)
// Run with: php -S 0.0.0.0:$PORT router.php

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Serve real files (css, js, images) directly
if ($uri !== '/' && file_exists(__DIR__ . $uri)) {
    return false; // let built-in server serve static files
}

// Route /api/* to api/index.php
if (strpos($uri, '/api') === 0) {
    require __DIR__ . '/api/index.php';
    return;
}

// Serve the frontend for root
if ($uri === '/' || $uri === '/index.html') {
    require __DIR__ . '/public/index.html';
    return;
}

// Serve anything inside /public/
if (strpos($uri, '/public/') === 0) {
    return false;
}

// Fallback — serve the frontend
require __DIR__ . '/public/index.html';