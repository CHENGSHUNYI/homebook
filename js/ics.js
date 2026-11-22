// 產生 .ics 行事曆檔：把到期日加進 iPhone 行事曆，就能收到系統通知（不需要伺服器）
import { alertsOf, TYPES, addDays, today } from './logic.js';

const esc = (s) => String(s || '').replace(/[\\;,]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
const d8 = (s) => s.replace(/-/g, '');
const nextDay = (s) => addDays(s, 1);
const day = (s) => (s < today() ? today() : s); // 已過期的放在今天

export function buildICS(records) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HomeBook//ZH-TW', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:家帳本提醒'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  for (const rec of records) {
    for (const a of alertsOf(rec)) {
      if (a.kind === 'empty') continue;
      lines.push('BEGIN:VEVENT',
        `UID:${rec.id}-${a.kind}@homebook`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${d8(day(a.date))}`,
        `DTEND;VALUE=DATE:${d8(nextDay(day(a.date)))}`,
        `SUMMARY:${esc(`${TYPES[rec.type].icon} ${rec.name}：${a.title}`)}`,
        `DESCRIPTION:${esc(a.text + '\n— 家帳本 HomeBook')}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(rec.name + ' ' + a.title)}`, 'TRIGGER:-PT15H', 'END:VALARM',
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(rec.name + ' ' + a.title)}`, 'TRIGGER:-P7D', 'END:VALARM',
        'END:VEVENT');
    }
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS(records, filename = 'homebook.ics') {
  const blob = new Blob([buildICS(records)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
