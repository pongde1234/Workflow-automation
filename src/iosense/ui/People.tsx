import { ActionListItemAvatar, Avatar, type AvatarColor, type AvatarSize } from '@faclon-labs/fds';
import { AtSign, ClipboardList, Phone, Users } from 'lucide-react';
import { CURRENT_USER_ID } from '../seed/seed';

/** Someone a node reaches: an iosense user, a form's email field, a typed address or number, or the maintenance queue. */
export interface Person {
  key: string;
  name: string;
  kind: 'user' | 'field' | 'email' | 'phone' | 'queue';
  /** The iosense user's id, for `kind: 'user'`. */
  userId?: string;
}

const KIND_ICON = { field: ClipboardList, email: AtSign, phone: Phone, queue: Users } as const;

/**
 * Avatar colour says something, never adds variety (Avatar guard,
 * tone-is-not-decoration): Brand is you, the signed-in user; Information is
 * someone outside iosense (an address from the form or typed in); everyone
 * else stays Neutral.
 */
export function personColor(p: Pick<Person, 'kind' | 'userId'>): AvatarColor {
  if (p.kind === 'user') return p.userId === CURRENT_USER_ID ? 'Brand' : 'Neutral';
  return p.kind === 'queue' ? 'Neutral' : 'Information';
}

export const userColor = (userId: string) => personColor({ kind: 'user', userId });

/** A user's initials, or the icon for an address, a form field or the queue (named for screen readers). */
export function PersonAvatar({ person, size }: { person: Person; size?: AvatarSize }) {
  const color = personColor(person);
  if (person.kind === 'user') return <Avatar size={size} name={person.name} color={color} />;
  return <Avatar size={size} icon={KIND_ICON[person.kind]} accessibilityLabel={person.name} color={color} />;
}

/** The leading avatar of a person row in a picker (locked to XSmall by the slot). */
export function PersonOptionAvatar({ person }: { person: Person }) {
  const color = personColor(person);
  return person.kind === 'user'
    ? <ActionListItemAvatar name={person.name} color={color} />
    : <ActionListItemAvatar icon={KIND_ICON[person.kind]} color={color} />;
}
