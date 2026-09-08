import { describe, expect, it } from 'vitest';
import { mergeAttachments } from './attachments';

describe('mergeAttachments', () => {
  it('keeps original files when no keep-list was submitted', () => {
    expect(mergeAttachments({ original: ['/api/files/a.pdf'], additions: ['/api/files/b.pdf'] }))
      .toEqual(['/api/files/a.pdf', '/api/files/b.pdf']);
  });

  it('only removes paths that belong to the request', () => {
    expect(mergeAttachments({
      original: ['/api/files/a.pdf', '/api/files/b.pdf'],
      keep: ['/api/files/b.pdf', '/api/files/other.pdf'],
      remove: ['/api/files/a.pdf', '/api/files/other.pdf'],
      keepListProvided: true,
    })).toEqual(['/api/files/b.pdf']);
  });
});
