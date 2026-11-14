import type { ActivityEntry } from '../../shared/types';
import type { Db } from './connection';

export function logActivity(db: Db, entity: ActivityEntry['entity'], entityId: number | null, action: ActivityEntry['action'], summary: string) {
  db.run('INSERT INTO activity_log (entity, entity_id, action, summary) VALUES (?, ?, ?, ?)', [entity, entityId, action, summary]);
  // Günlük tablosunun sınırsız büyümesini önle (son 2000 kayıt tutulur).
  db.run('DELETE FROM activity_log WHERE id <= (SELECT id FROM activity_log ORDER BY id DESC LIMIT 1 OFFSET 2000)');
}

export function listActivity(db: Db, limit: number): ActivityEntry[] {
  const n = Math.min(Math.max(Math.trunc(limit) || 10, 1), 200);
  return db.all<ActivityEntry>(
    `SELECT id, created_at AS createdAt, entity, action, summary FROM activity_log ORDER BY id DESC LIMIT ?`,
    [n],
  );
}
