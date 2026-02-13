import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// โฟลเดอร์เก็บไฟล์แยกจาก public เพื่อความปลอดภัย
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

// ไฟล์ที่อนุญาต
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Magic bytes สำหรับตรวจสอบเนื้อหาไฟล์จริง
const MAGIC_BYTES: Record<string, number[][]> = {
    '.png': [[0x89, 0x50, 0x4E, 0x47]],                         // \x89PNG
    '.jpg': [[0xFF, 0xD8, 0xFF]],                                // JPEG SOI
    '.jpeg': [[0xFF, 0xD8, 0xFF]],                                // JPEG SOI
    '.pdf': [[0x25, 0x50, 0x44, 0x46]],                          // %PDF
};

/**
 * ตรวจ magic bytes ว่าเนื้อหาไฟล์ตรงกับ extension หรือไม่
 */
function validateMagicBytes(buffer: Buffer, ext: string): boolean {
    const signatures = MAGIC_BYTES[ext];
    if (!signatures) return true; // ไม่มีข้อมูล → ไม่บล็อก
    return signatures.some(sig =>
        sig.every((byte, i) => buffer.length > i && buffer[i] === byte)
    );
}

/**
 * Ensures the upload directory exists
 */
function ensureUploadDir() {
    if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
}

/**
 * Check if file extension is allowed
 */
export function isAllowedFileType(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return ALLOWED_EXTENSIONS.includes(ext);
}

/**
 * Check if file size is within limit
 */
export function isFileSizeValid(size: number): boolean {
    return size <= MAX_FILE_SIZE;
}

/**
 * Save a file to /uploads/ and return the relative path
 * Path format: /api/files/{filename} for secure access
 */
export async function saveFile(file: File): Promise<string> {
    // Validate file type
    if (!isAllowedFileType(file.name)) {
        throw new Error(`ไฟล์ประเภท ${path.extname(file.name)} ไม่อนุญาต (รองรับ: PNG, JPG, PDF)`);
    }

    // Validate file size
    if (!isFileSizeValid(file.size)) {
        throw new Error(`ไฟล์มีขนาดใหญ่เกิน 10MB`);
    }

    ensureUploadDir();

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name).toLowerCase();

    // ตรวจ magic bytes — ป้องกันการเปลี่ยนนามสกุลไฟล์อันตราย
    if (!validateMagicBytes(buffer, ext)) {
        throw new Error(`ไฟล์ไม่ตรงกับประเภทที่ระบุ (${ext}) — อาจเป็นไฟล์ปลอม`);
    }

    const filename = `${crypto.randomUUID()}${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    await fs.promises.writeFile(filepath, buffer);

    // Return API path for secure file access
    return `/api/files/${filename}`;
}

/**
 * Get the actual file path from API path
 */
export function getFilePath(apiPath: string): string | null {
    // Extract filename from /api/files/{filename}
    const match = apiPath.match(/^\/api\/files\/(.+)$/);
    if (!match) return null;

    const filename = match[1];
    // Prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return null;
    }

    return path.join(UPLOAD_DIR, filename);
}

/**
 * Read a file from uploads folder
 */
export async function readFile(apiPath: string): Promise<Buffer | null> {
    const filepath = getFilePath(apiPath);
    if (!filepath) return null;

    try {
        return await fs.promises.readFile(filepath);
    } catch {
        return null;
    }
}

/**
 * Get file mime type
 */
export function getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.pdf': 'application/pdf',
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Delete a file from the filesystem
 */
export async function deleteFile(apiPath: string): Promise<void> {
    const filepath = getFilePath(apiPath);
    if (!filepath) return;

    try {
        await fs.promises.unlink(filepath);
    } catch (e) {
        console.warn(`Failed to delete file: ${filepath}`, e);
    }
}

/**
 * Check if file exists
 */
export async function fileExists(apiPath: string): Promise<boolean> {
    const filepath = getFilePath(apiPath);
    if (!filepath) return false;

    try {
        await fs.promises.access(filepath);
        return true;
    } catch {
        return false;
    }
}
