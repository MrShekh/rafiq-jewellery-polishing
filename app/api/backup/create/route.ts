import path from "node:path";

import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { createBackupZip, defaultBackupFileName } from "@/lib/backup/backup";
import { BACKUP_DIR } from "@/lib/paths";
import { recordAudit } from "@/lib/db/repositories/audit";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await requireUser();
    const fileName = defaultBackupFileName();
    const destPath = path.join(BACKUP_DIR, fileName);

    await createBackupZip(destPath);
    await recordAudit({ entityType: "backup", action: "create", userId: user.id, message: fileName });

    return ok({ filePath: destPath, fileName });
  } catch (err) {
    return handleApiError(err);
  }
}
