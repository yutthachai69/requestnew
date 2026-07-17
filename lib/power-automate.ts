// lib/power-automate.ts — POC: ส่งการ์ดแจ้งเตือนเข้า Teams ผ่าน Power Automate webhook
//
// .env:
//   POWER_AUTOMATE_WEBHOOK_URL=https://...environment.api.powerplatform.com/.../triggers/manual/paths/invoke?...
//
// ใช้กับเทมเพลต "Send webhook alerts to a channel" (Teams webhook trigger)
// ซึ่งรับ payload เป็น Adaptive Card ในรูปแบบ message + attachments แล้วโพสต์เข้า channel ให้เอง
// ถ้าไม่ตั้งค่า env นี้ = ปิดฟีเจอร์ (no-op) ไม่กระทบการทำงานเดิม

export interface FlowEvent {
  workOrderNo: string;
  requester: string;
  title: string;
  status: string;
  link?: string;
}

/** ประกอบ Adaptive Card ตามรูปแบบที่ Teams webhook trigger ต้องการ */
function buildTeamsCard(event: FlowEvent) {
  const facts = [
    { title: 'เลขที่', value: event.workOrderNo },
    { title: 'ผู้ขอ', value: event.requester },
    { title: 'เรื่อง', value: event.title || '-' },
  ];

  const card: Record<string, unknown> = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.4',
    body: [
      {
        type: 'TextBlock',
        size: 'Large',
        weight: 'Bolder',
        text: `📋 คำขอ F07: ${event.status}`,
        wrap: true,
      },
      { type: 'FactSet', facts },
    ],
  };

  if (event.link) {
    card.actions = [{ type: 'Action.OpenUrl', title: 'เปิดคำขอ', url: event.link }];
  }

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: card,
      },
    ],
  };
}

/**
 * ยิงการ์ดเข้า Teams แบบ fire-and-forget
 * - ล้มเหลว/timeout จะไม่ throw (ไม่ทำให้การอนุมัติพัง)
 * - ไม่ตั้งค่า URL = ข้ามเงียบๆ
 */
export async function postToPowerAutomate(event: FlowEvent): Promise<void> {
  const url = process.env.POWER_AUTOMATE_WEBHOOK_URL?.trim();
  if (!url) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildTeamsCard(event)),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('[power-automate] ส่งการ์ดล้มเหลว:', res.status, text.slice(0, 200));
    } else if (process.env.NODE_ENV !== 'production') {
      console.info('[power-automate] ส่งการ์ดสำเร็จ →', event.workOrderNo, event.status);
    }
  } catch (err) {
    console.error('[power-automate] ส่งการ์ดล้มเหลว:', err instanceof Error ? err.message : err);
  } finally {
    clearTimeout(timer);
  }
}
