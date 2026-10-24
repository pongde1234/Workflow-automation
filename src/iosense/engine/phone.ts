import type { IoUser } from '../domain/types';
import { parseAddresses } from './email';

/** 8–15 digits, optionally led by + and grouped with spaces, dashes or brackets. */
export function isValidPhone(text: string): boolean {
  const t = text.trim();
  if (!/^\+?[\d\s\-()]+$/.test(t)) return false;
  const digits = t.replace(/\D/g, '').length;
  return digits >= 8 && digits <= 15;
}

export const invalidPhones = (text: string) => parseAddresses(text).filter((n) => !isValidPhone(n));

export interface PhoneRecipient { number: string; label: string }
export interface PhoneProblem { label: string; reason: 'invalid' | 'missing'; source: 'user' | 'other' }

/** Turns an SMS node's recipients into numbers for one run. */
export function resolvePhones(cfg: { to: string[]; other: string }, users: IoUser[]): { recipients: PhoneRecipient[]; problems: PhoneProblem[] } {
  const recipients: PhoneRecipient[] = [];
  const problems: PhoneProblem[] = [];
  const seen = new Set<string>();
  const add = (r: PhoneRecipient) => {
    const key = r.number.replace(/\D/g, '');
    if (!seen.has(key)) { seen.add(key); recipients.push(r); }
  };
  for (const ref of cfg.to) {
    const user = users.find((u) => `user:${u.id}` === ref);
    if (user?.phone) add({ number: user.phone, label: user.name });
    else problems.push({ label: user?.name ?? 'A recipient', reason: 'missing', source: 'user' });
  }
  for (const n of parseAddresses(cfg.other)) {
    if (isValidPhone(n)) add({ number: n, label: n });
    else problems.push({ label: n, reason: 'invalid', source: 'other' });
  }
  return { recipients, problems };
}
