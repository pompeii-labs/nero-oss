import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';

/**
 * Local blob store for attachments. Fully local, under ~/.nero/cache/files
 * (same home convention as ~/.nero/config.json), never the repo or the cloud.
 * The model receives images as base64 blocks at session-build time; the web
 * displays them via GET /v1/files/:id.
 */
const DIR = process.env.NERO_FILES_DIR || join(homedir(), '.nero', 'cache', 'files');

export interface StoredFileRef {
    id: string;
    mime: string;
    name: string;
}

function safeId(id: string): boolean {
    return /^[0-9a-f-]{36}$/i.test(id);
}

export async function saveUpload(
    base64: string,
    name: string,
    mime: string,
): Promise<StoredFileRef> {
    await mkdir(DIR, { recursive: true });
    const id = randomUUID();
    await writeFile(join(DIR, id), Buffer.from(base64, 'base64'));
    await writeFile(join(DIR, `${id}.json`), JSON.stringify({ mime, name }));
    return { id, mime, name };
}

export async function loadFile(
    id: string,
): Promise<{ bytes: Buffer; mime: string; name: string } | null> {
    if (!safeId(id)) return null;
    try {
        const meta = JSON.parse(await readFile(join(DIR, `${id}.json`), 'utf-8')) as {
            mime: string;
            name: string;
        };
        const bytes = await readFile(join(DIR, id));
        return { bytes, mime: meta.mime, name: meta.name };
    } catch {
        return null;
    }
}

export async function fileBase64(id: string): Promise<{ base64: string; mime: string } | null> {
    const f = await loadFile(id);
    if (!f) return null;
    return { base64: f.bytes.toString('base64'), mime: f.mime };
}
