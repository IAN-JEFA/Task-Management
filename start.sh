#!/bin/sh
# Railway injects $PORT automatically. This script ensures it expands correctly.
exec php -S 0.0.0.0:${PORT:-8080} index.php
