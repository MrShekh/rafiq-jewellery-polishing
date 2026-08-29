import { NextRequest } from "next/server";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";

import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { stageRestore } from "@/lib/backup/restore";
import { recordAudit } from "@/lib/db/repositories/audit";
import { tempDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

const schema = z.object({ filePath: z.string().min(1) });

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

    await recordAudit({
      entityType: "backup",
      action: "restore_staged",
      userId: user.id,
      message: `Staged restore from ${filePath}; safety backup at ${marker.safetyBackupPath}`,
    });

    return ok({ requiresRestart: true, marker });
  } catch (err) {
    return handleApiError(err);
  }
}
