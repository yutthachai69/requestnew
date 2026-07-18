export function parseAttachments(attachmentPath: string | null | undefined): string[] {
  if (!attachmentPath) return [];
  try {
    const parsed = JSON.parse(attachmentPath);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return attachmentPath ? [attachmentPath] : [];
  }
}

export function isImageFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  return ['png', 'jpg', 'jpeg'].includes(ext || '');
}

export function isPdfFile(path: string): boolean {
  return path.toLowerCase().endsWith('.pdf');
}
