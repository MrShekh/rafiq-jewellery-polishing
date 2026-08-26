import path from "node:path";
import fs from "node:fs";

import { NextRequest, NextResponse } from "next/server";

import { handleApiError } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { BACKUP_DIR } from "@/lib/paths";

// Always dynamic: every route here reads the session cookie and/or hits
// SQLite directly, so there is nothing safe to prerender or cache.
export const dynamic = "force-dynamic";

/**
 * Browser-download fallback for backups (used when there's no Electron
 * bridge to drive a native "Save As" dialog - see lib/electron-bridge.ts).
 * Only ever serves a bare filename resolved *inside* BACKUP_DIR - path
 * components are stripped so this can't be used to read arbitrary files
 * off the machine.
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const fileName = new URL(req.url).searchParams.get("file");
    if (!fileName) return NextResponse.json({ error: "Missing file name." }, { status: 400 });

    const safeName = path.basename(fileName);
    const fullPath = path.join(BACKUP_DIR, safeName);
    if (!fullPath.startsWith(BACKUP_DIR) || !fs.existsSync(fullPath)) {
      return NextResponse.json({ error: "That backup file could not be found." }, { status: 404 });
    }

    const buffer = fs.readFileSync(fullPath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName}"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
