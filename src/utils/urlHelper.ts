/**
 * Helper to manage student URLs and Zalo link generation
 */

const CUSTOM_URL_STORAGE_KEY = 'hhct_custom_public_url';

export function getSharedPublicUrl(): string {
  const origin = window.location.origin;
  if (origin.includes('ais-dev-')) {
    return origin.replace('ais-dev-', 'ais-pre-');
  }
  return origin;
}

export function getCurrentOriginUrl(): string {
  return window.location.origin;
}

export function getCustomPublicBaseUrl(): string {
  try {
    const saved = localStorage.getItem(CUSTOM_URL_STORAGE_KEY);
    if (saved) return saved.trim();
  } catch (e) {}
  return '';
}

export function setCustomPublicBaseUrl(url: string | null) {
  try {
    if (!url || !url.trim()) {
      localStorage.removeItem(CUSTOM_URL_STORAGE_KEY);
    } else {
      let clean = url.trim().replace(/\/+$/, '');
      if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = 'https://' + clean;
      }
      localStorage.setItem(CUSTOM_URL_STORAGE_KEY, clean);
    }
  } catch (e) {}
}

export function getActiveBaseUrl(): string {
  const custom = getCustomPublicBaseUrl();
  if (custom) return custom;
  return getSharedPublicUrl();
}

export function getStudentExamUrl(accessCode: string): string {
  const base = getActiveBaseUrl();
  return `${base}?exam=${encodeURIComponent(accessCode.trim().toUpperCase())}`;
}

export function formatZaloShareText(
  examTitle: string,
  accessCode: string,
  durationMinutes: number
): string {
  const url = getStudentExamUrl(accessCode);
  return `📢 THÔNG BÁO BÀI KIỂM TRA HÓA HỌC: "${examTitle}"
⏱ Thời gian làm bài: ${durationMinutes > 0 ? `${durationMinutes} phút` : 'Tự do'}
🔑 Mã đề thi: ${accessCode.toUpperCase()}

👉 Link làm bài trực tiếp cho học sinh:
${url}

💡 Hướng dẫn cho học sinh:
1. Nhấp trực tiếp vào link trên hoặc quét mã QR để vào thi.
2. Nhập đầy đủ Họ tên và Lớp, sau đó bấm "BẮT ĐẦU LÀM BÀI".
3. Nhớ bấm "NỘP BÀI" khi làm xong.`;
}
