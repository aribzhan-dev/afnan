import type { Product, Variant } from './types';
export const money = (amount: number) =>
  new Intl.NumberFormat('ru-KZ', { maximumFractionDigits: 0 }).format(amount) + ' ₸';
export const price = (p: Product, v: Variant = p.variants[0]) =>
  Math.floor((v.price * (100 - (p.discount_enabled ? p.discount_percent : 0)) + 50) / 100);
export const dateLabel = (date: string) =>
  new Date(date).toLocaleString('ru-RU', {
    timeZone: 'Asia/Almaty',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch('/api' + path, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(typeof body.detail === 'string' ? body.detail : 'Не удалось выполнить запрос');
  return body as T;
}
export const json = (method: string, data: unknown): RequestInit => ({
  method,
  body: JSON.stringify(data),
});
export const statusLabels = {
  new: 'Новый',
  confirmed: 'Подтверждён',
  completed: 'Выполнен',
  cancelled: 'Отменён',
};
export function readStorage<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

export const lineTotal = (unitPrice: number, quantity: number) =>
  Math.floor((unitPrice * Math.round(quantity * 1000) + 500) / 1000);
