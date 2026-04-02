<?php
// models/Task.php

require_once __DIR__ . '/../config/database.php';

class Task {

    const VALID_PRIORITIES = ['low', 'medium', 'high'];
    const VALID_STATUSES   = ['pending', 'in_progress', 'done'];
    const STATUS_FLOW      = ['pending' => 'in_progress', 'in_progress' => 'done'];

    public static function all(?string $status = null): array {
        $pdo    = getDBConnection();
        $sql    = "SELECT * FROM tasks";
        $params = [];
        if ($status !== null) {
            $sql .= " WHERE status = :status";
            $params[':status'] = $status;
        }
        $sql .= " ORDER BY FIELD(priority,'high','medium','low'), due_date ASC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public static function findById(int $id): ?array {
        $pdo  = getDBConnection();
        $stmt = $pdo->prepare("SELECT * FROM tasks WHERE id = :id");
        $stmt->execute([':id' => $id]);
        return $stmt->fetch() ?: null;
    }

    public static function create(array $data): array {
        $pdo  = getDBConnection();
        $stmt = $pdo->prepare(
            "INSERT INTO tasks (title, due_date, priority, status)
             VALUES (:title, :due_date, :priority, 'pending')"
        );
        $stmt->execute([
            ':title'    => $data['title'],
            ':due_date' => $data['due_date'],
            ':priority' => $data['priority'],
        ]);
        return self::findById((int)$pdo->lastInsertId());
    }

    public static function updateStatus(int $id, string $newStatus): ?array {
        $pdo  = getDBConnection();
        $stmt = $pdo->prepare("UPDATE tasks SET status = :status WHERE id = :id");
        $stmt->execute([':status' => $newStatus, ':id' => $id]);
        return self::findById($id);
    }

    public static function delete(int $id): void {
        $pdo  = getDBConnection();
        $stmt = $pdo->prepare("DELETE FROM tasks WHERE id = :id");
        $stmt->execute([':id' => $id]);
    }

    public static function existsByTitleAndDate(string $title, string $dueDate): bool {
        $pdo  = getDBConnection();
        $stmt = $pdo->prepare(
            "SELECT COUNT(*) FROM tasks WHERE title = :title AND due_date = :due_date"
        );
        $stmt->execute([':title' => $title, ':due_date' => $dueDate]);
        return (int)$stmt->fetchColumn() > 0;
    }

    public static function reportByDate(string $date): array {
        $pdo  = getDBConnection();
        $stmt = $pdo->prepare(
            "SELECT priority, status, COUNT(*) as cnt
             FROM tasks WHERE due_date = :date
             GROUP BY priority, status"
        );
        $stmt->execute([':date' => $date]);

        $summary = [];
        foreach (self::VALID_PRIORITIES as $p)
            foreach (self::VALID_STATUSES as $s)
                $summary[$p][$s] = 0;

        foreach ($stmt->fetchAll() as $row)
            $summary[$row['priority']][$row['status']] = (int)$row['cnt'];

        return $summary;
    }

    public static function getNextStatus(string $current): ?string {
        return self::STATUS_FLOW[$current] ?? null;
    }
}
