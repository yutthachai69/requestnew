export function parseAttachments(attachmentPath: string | null | undefined): string[] {
  if (!attachmentPath) return [];
  try {
    const parsed = JSON.parse(attachmentPath);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return attachmentPath ? [attachmentPath] : [];
  }
}

/**
 * Build the replacement attachment list without accepting paths from another
 * request. When the client did not send a keep-list, all original files are
 * retained and only explicitly requested removals are applied.
 */
export function mergeAttachments(input: {
  original: string[];
  keep?: string[];
  remove?: string[];
  additions?: string[];
  keepListProvided?: boolean;
}): string[] {
  const originalSet = new Set(input.original);
  const removed = new Set((input.remove ?? []).filter((filePath) => originalSet.has(filePath)));
  const kept = input.keepListProvided
    ? (input.keep ?? []).filter((filePath) => originalSet.has(filePath) && !removed.has(filePath))
    : input.original.filter((filePath) => !removed.has(filePath));
  return [...kept, ...(input.additions ?? [])];
}

export function isImageFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  return ['png', 'jpg', 'jpeg'].includes(ext || '');
}

export function isPdfFile(path: string): boolean {
  return path.toLowerCase().endsWith('.pdf');
}
