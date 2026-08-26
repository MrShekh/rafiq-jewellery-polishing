import path from "node:path";

import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { createBackupZip, defaultBackupFileName } from "@/lib/backup/backup";
import { BACKUP_DIR } from "@/lib/paths";
import { recordAudit } from "@/lib/db/repositories/audit";
import { db } from "@/lib/db/client";

// Always dynamic: every route here reads the session cookie and/or hits
// SQLite directly, so there is nothing safe to prerender or cache.
export const dynamic = "force-dynamic";

/**
 * Creates a backup zip into the app's managed backups folder and returns
 * its path. The renderer then offers it to the user via the native "Save
 * As" dialog (electron/ipc/dialogs.ts `saveFileAs`), which is what lets the
 * user "choose a location" (section 27) while keeping raw filesystem
 * access out of the renderer process (section 30).
 */
export async function POST() {
  try {
    const user = await requireUser();
    const fileName = defaultBackupFileName();
    const destPath = path.join(BACKUP_DIR, fileName);

    await createBackupZip(destPath);
    db.transaction((tx) => {
      recordAudit(tx, { entityType: "backup", action: "create", userId: user.id, message: fileName });
    });

    return ok({ filePath: destPath, fileName });
  } catch (err) {
    return handleApiError(err);
  }
}
