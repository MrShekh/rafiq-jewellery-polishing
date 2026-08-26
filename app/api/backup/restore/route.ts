import { NextRequest } from "next/server";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";

import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { stageRestore } from "@/lib/backup/restore";
import { recordAudit } from "@/lib/db/repositories/audit";
import { db } from "@/lib/db/client";
import { tempDir } from "@/lib/paths";

// Always dynamic: every route here reads the session cookie and/or hits
// SQLite directly, so there is nothing safe to prerender or cache.
export const dynamic = "force-dynamic";

const schema = z.object({ filePath: z.string().min(1) });

/**
 * Stages a restore (section 28). This never touches the live database in
 * this request - see lib/backup/restore.ts for why a full app restart is
 * required to safely complete it, and electron/main.ts for the startup
 * check that performs the actual swap.
 *
 * Accepts two request shapes:
 *   - JSON `{ filePath }` - the normal desktop flow, where Electron's
 *     native "Open File" dialog (electron/ipc/dialogs.ts) already resolved
 *     an absolute path on the user's own machine.
 *   - `multipart/form-data` with a `file` field - a fallback used only
 *     when the app is running as a plain browser tab with no Electron
 *     bridge (e.g. during `next dev`), so restore stays testable without
 *     the desktop shell.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const contentType = req.headers.get("content-type") ?? "";

    let filePath: string;
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return ok({ error: "No backup file was uploaded." }, 400);
      }
      const dir = tempDir("jp-restore-upload-");
      filePath = path.join(dir, file.name || "backup.zip");
      fs.writeFileSync(filePath, Buffer.from(await file.arrayBuffer()));
    } else {
      ({ filePath } = schema.parse(await req.json()));
    }

    if (!fs.existsSync(filePath)) {
      return ok({ error: "That backup file could not be found." }, 400);
    }

    const marker = await stageRestore(filePath);

    db.transaction((tx) => {
      recordAudit(tx, {
        entityType: "backup",
        action: "restore_staged",
        userId: user.id,
        message: `Staged restore from ${filePath}; safety backup at ${marker.safetyBackupPath}`,
      });
    });

    return ok({ requiresRestart: true, marker });
  } catch (err) {
    return handleApiError(err);
  }
}
