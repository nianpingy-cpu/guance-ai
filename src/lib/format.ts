const cny = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const cny2 = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });

export function formatCny(cents: number | null | undefined, decimals: 0 | 2 = 0): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '暂无数据';
  return decimals === 2 ? cny2.format(cents / 100) : cny.format(cents / 100);
}

export function formatCnyCompact(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '—';
  const yuan = cents / 100;
  if (Math.abs(yuan) >= 1e12) return `¥${(yuan / 1e12).toFixed(1)}万亿`;
  if (Math.abs(yuan) >= 1e8) return `¥${(yuan / 1e8).toFixed(1)}亿`;
  if (Math.abs(yuan) >= 10000) return `¥${(yuan / 10000).toFixed(yuan >= 100000 ? 0 : 1)}万`;
  if (Math.abs(yuan) >= 1000) return `¥${(yuan / 1000).toFixed(yuan >= 10000 ? 0 : 1)}k`;
  return `¥${integer.format(yuan)}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '暂无数据';
  return integer.format(value);
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1e12) return `${(value / 1e12).toFixed(1)}万亿`;
  if (Math.abs(value) >= 1e8) return `${(value / 1e8).toFixed(1)}亿`;
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 1 : 2)}万`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return integer.format(value);
}

export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '暂无数据';
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDate(value: string | null | undefined, withYear = false): string {
  if (!value) return '暂无日期';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无日期';
  return new Intl.DateTimeFormat('zh-CN', {
    ...(withYear ? { year: 'numeric' as const } : {}),
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '暂无时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无时间';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatWeekday(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date);
}

export function formatShortId(id: string): string {
  return id.length <= 14 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function plural(count: number, unit: string): string {
  return `${count}${unit}`;
}

export type ParseAmountResult =
  | { ok: true; cents: number }
  | { ok: false; message: string };

/** Parses a yuan string/number into integer cents. */
export function parseYuanToCents(input: string | number | null | undefined): ParseAmountResult {
  if (input === null || input === undefined || input === '') return { ok: false, message: '请输入金额' };
  const raw = String(input).trim().replace(/[¥￥,\s]/g, '');
  if (!/^(?:0|[1-9]\d*)(?:\.\d{0,2})?$/.test(raw)) {
    return { ok: false, message: '金额须为非负数，最多两位小数' };
  }
  const cents = Math.round(Number(raw) * 100);
  if (!Number.isSafeInteger(cents)) return { ok: false, message: '金额超出可处理范围' };
  return { ok: true, cents };
}

export function parseWholeNumber(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === '') return null;
  const raw = String(input).trim().replace(/,/g, '');
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
/** SVG labels use fixed lanes; the full value remains in tooltips and accessible labels. */
export function shortChartLabel(value: string, length = 10): string { const chars = [...value]; return chars.length > length ? chars.slice(0, Math.max(1, length - 1)).join('') + '…' : value; }

