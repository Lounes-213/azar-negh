import { randomId } from "./crypto";
import { nowIso } from "./http";

export interface AuditInput {
  actorId: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipHash?: string | null;
}

export function auditStatement(db: D1Database, input: AuditInput): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata_json, ip_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      randomId(),
      input.actorId,
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.ipHash ?? null,
      nowIso(),
    );
}

export async function recordAudit(db: D1Database, input: AuditInput): Promise<void> {
  await auditStatement(db, input).run();
}
