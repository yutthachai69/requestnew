import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendApprovalEmail } from './mail';

const email = {
  to: ['approver@example.com'],
  subject: 'E2E email test',
  body: '<p>test</p>',
};

describe('sendApprovalEmail', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function configureApi() {
    vi.stubEnv('INTERNAL_EMAIL_API_URL', 'http://127.0.0.1:4010/send');
    vi.stubEnv('VITE_INTERNAL_EMAIL_API_URL', '');
    vi.stubEnv('NEXT_PUBLIC_INTERNAL_EMAIL_API_URL', '');
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('SMTP_USER', '');
    vi.stubEnv('SMTP_PASSWORD', '');
  }

  it('reports no recipients without calling a provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendApprovalEmail({ ...email, to: ['not-an-email'] });

    expect(result).toEqual({ ok: false, reason: 'no_recipients' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a provider HTTP failure without throwing', async () => {
    configureApi();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('provider unavailable', { status: 503, statusText: 'Service Unavailable' }),
    ));

    await expect(sendApprovalEmail(email)).resolves.toMatchObject({
      ok: false,
      reason: 'api_failed',
    });
  });

  it('aborts a provider call after the configured timeout', async () => {
    configureApi();
    vi.stubEnv('EMAIL_API_TIMEOUT_MS', '10');
    const fetchMock = vi.fn((_url: string, options?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const startedAt = Date.now();
    const result = await sendApprovalEmail(email);

    expect(result).toMatchObject({ ok: false, reason: 'api_failed' });
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });
});
