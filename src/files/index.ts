import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname } from 'path';
import crypto from 'crypto';
import { getConfigDir } from '../config.js';

export interface FileRef {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
}

const UPLOADS_DIR = () => join(getConfigDir(), 'uploads');

const IMAGE_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
]);

const TEXT_MIME_TYPES = new Set([
    'text/plain',
    'text/csv',
    'text/markdown',
    'text/html',
    'text/css',
    'text/xml',
    'text/yaml',
    'text/javascript',
    'application/json',
    'application/xml',
    'application/yaml',
    'application/x-yaml',
    'application/javascript',
    'application/typescript',
    'application/x-sh',
]);

const TEXT_EXTENSIONS = new Set([
    '.txt',
    '.csv',
    '.json',
    '.md',
    '.ts',
    '.js',
    '.py',
    '.html',
    '.css',
    '.xml',
    '.yaml',
    '.yml',
    '.toml',
    '.sql',
    '.sh',
    '.log',
    '.env',
    '.cfg',
    '.ini',
    '.conf',
    '.rb',
    '.go',
    '.rs',
    '.java',
    '.kt',
    '.swift',
    '.c',
    '.cpp',
    '.h',
    '.hpp',
]);

function extFromMime(mimeType: string): string {
    const map: Record<string, string> = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'application/pdf': '.pdf',
        'text/plain': '.txt',
        'text/csv': '.csv',
        'text/markdown': '.md',
        'text/html': '.html',
        'text/css': '.css',
        'application/json': '.json',
        'application/xml': '.xml',
        'text/xml': '.xml',
        'text/yaml': '.yaml',
        'application/yaml': '.yaml',
        'text/javascript': '.js',
        'application/javascript': '.js',
        'application/typescript': '.ts',
    };
    return map[mimeType] || '.bin';
}

async function ensureUploadsDir(): Promise<string> {
    const dir = UPLOADS_DIR();
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
    }
    return dir;
}

export async function saveUpload(
    data: Buffer,
    originalName: string,
    mimeType: string,
): Promise<FileRef> {
    const dir = await ensureUploadsDir();
    const id = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    const ext = extname(originalName) || extFromMime(mimeType);
    const filename = `${id}${ext}`;
    const filePath = join(dir, filename);

    await writeFile(filePath, data);

    return {
        id: filename,
        originalName,
        mimeType,
        size: data.length,
    };
}

export function getFilePath(fileId: string): string {
    return join(UPLOADS_DIR(), fileId);
}

export async function readFileAsBase64(fileId: string): Promise<string> {
    const filePath = getFilePath(fileId);
    const buffer = await readFile(filePath);
    return buffer.toString('base64');
}

export async function readFileAsText(fileId: string): Promise<string> {
    const filePath = getFilePath(fileId);
    return readFile(filePath, 'utf-8');
}

export function isImageMimeType(mimeType: string): boolean {
    return IMAGE_MIME_TYPES.has(mimeType.toLowerCase());
}

export function isTextMimeType(mimeType: string): boolean {
    if (TEXT_MIME_TYPES.has(mimeType.toLowerCase())) return true;
    if (mimeType.toLowerCase().startsWith('text/')) return true;
    return false;
}

export function isTextExtension(ext: string): boolean {
    return TEXT_EXTENSIONS.has(ext.toLowerCase());
}

export function isPdfMimeType(mimeType: string): boolean {
    return mimeType.toLowerCase() === 'application/pdf';
}

export async function extractPdfText(fileId: string): Promise<string> {
    const filePath = getFilePath(fileId);
    const buffer = await readFile(filePath);
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
}
