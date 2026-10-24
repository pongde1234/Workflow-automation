import type { EmailConfig, IoUser, TriggerVariable } from '../domain/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isValidEmail = (s: string) => EMAIL_RE.test(s.trim());

/** Split "a@x.com, b@y.com; c@z.com" into trimmed, non-empty entries. */
export function parseAddresses(text: string): string[] {
  return text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

export const invalidAddresses = (text: string) => parseAddresses(text).filter((a) => !isValidEmail(a));

export interface Recipient { address: string; label: string; source: 'user' | 'field' | 'other' }
export interface RecipientProblem { label: string; reason: 'empty' | 'invalid' | 'missing'; source: Recipient['source']; value?: string }

/**
 * Turns an Email node's recipients into addresses for one run.
 * `values` holds the run's trigger values by variable id.
 */
export function resolveRecipients(
  cfg: EmailConfig,
  ctx: { users: IoUser[]; vars: TriggerVariable[]; values: Record<string, unknown> },
): { recipients: Recipient[]; problems: RecipientProblem[] } {
  const recipients: Recipient[] = [];
  const problems: RecipientProblem[] = [];
  const seen = new Set<string>();
  const add = (r: Recipient) => {
    const key = r.address.toLowerCase();
    if (!seen.has(key)) { seen.add(key); recipients.push(r); }
  };

  for (const ref of cfg.to) {
    if (ref.startsWith('user:')) {
      const user = ctx.users.find((u) => u.id === ref.slice(5));
      if (user) add({ address: user.email, label: user.name, source: 'user' });
      else problems.push({ label: 'A recipient', reason: 'missing', source: 'user' });
    } else if (ref.startsWith('field:')) {
      const v = ctx.vars.find((x) => x.id === ref.slice(6));
      if (!v) { problems.push({ label: 'A form field', reason: 'missing', source: 'field' }); continue; }
      const raw = ctx.values[v.id];
      const value = raw === undefined || raw === null ? '' : String(raw).trim();
      if (!value) problems.push({ label: v.label, reason: 'empty', source: 'field' });
      else if (!isValidEmail(value)) problems.push({ label: v.label, reason: 'invalid', source: 'field', value });
      else add({ address: value, label: v.label, source: 'field' });
    }
  }
  for (const a of parseAddresses(cfg.other)) {
    if (isValidEmail(a)) add({ address: a, label: a, source: 'other' });
    else problems.push({ label: a, reason: 'invalid', source: 'other', value: a });
  }
  return { recipients, problems };
}
