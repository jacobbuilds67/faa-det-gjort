import type { Context, Member } from '../domain/model';
import { localContext } from './db';

const PROFILE_KEY = 'faa-det-gjort-local-profile';
const MEMBERS_KEY = 'faa-det-gjort-local-members';

export type LocalProfile = { userId: string; name: string };

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function loadLocalProfile(): LocalProfile {
  try {
    const value = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') as Partial<LocalProfile> | null;
    if (value && isUuid(value.userId) && typeof value.name === 'string' && value.name.trim()) {
      return { userId: value.userId, name: value.name.trim().slice(0, 80) };
    }
  } catch {
    // En beskadiget profil erstattes nedenfor. Opgavedata røres ikke.
  }
  const profile = {
    // Bevar den gamle lokale database på enheder, der allerede brugte lokal tilstand.
    userId: localStorage.getItem('hverdagsro-mode') === 'local' ? localContext.userId : crypto.randomUUID(),
    name: 'Dig',
  };
  saveLocalProfile(profile);
  return profile;
}

export function saveLocalProfile(profile: LocalProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, name: profile.name.trim().slice(0, 80) }));
}

export function localContextFor(profile: LocalProfile): Context {
  return { ...localContext, userId: profile.userId, local: true };
}

export function loadLocalMembers(profile: LocalProfile): Member[] {
  let stored: Member[] = [];
  try {
    const value = JSON.parse(localStorage.getItem(MEMBERS_KEY) ?? '[]') as unknown;
    if (Array.isArray(value)) {
      stored = value.filter(
        (member): member is Member =>
          !!member &&
          typeof member === 'object' &&
          isUuid((member as Member).userId) &&
          typeof (member as Member).name === 'string' &&
          ['owner', 'member'].includes((member as Member).role),
      );
    }
  } catch {
    // Fortsæt med den lokale bruger.
  }
  return mergeMembers(stored, [{ userId: profile.userId, name: profile.name, role: 'owner' }]);
}

export function mergeMembers(current: Member[], incoming: Member[]): Member[] {
  const byId = new Map(current.map((member) => [member.userId, member]));
  for (const member of incoming) if (!byId.has(member.userId)) byId.set(member.userId, member);
  return [...byId.values()];
}

export function saveLocalMembers(members: Member[]) {
  localStorage.setItem(MEMBERS_KEY, JSON.stringify(members));
}
