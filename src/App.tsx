import { lazy, Suspense, useState } from 'react';
import { Leaf } from 'lucide-react';
import type { Member } from './domain/model';
import {
  loadLocalMembers,
  loadLocalProfile,
  localContextFor,
  saveLocalMembers,
  saveLocalProfile,
  type LocalProfile,
} from './data/localProfile';

const Workspace = lazy(() =>
  import('./features/Workspace').then(({ Workspace }) => ({ default: Workspace })),
);

function WorkspaceFallback() {
  return (
    <main className="loading">
      <Leaf size={32} />
      <p>Gør arbejdsområdet klar …</p>
    </main>
  );
}

export default function App() {
  const [profile, setProfile] = useState<LocalProfile>(() => loadLocalProfile());
  const [members, setMembers] = useState<Member[]>(() => loadLocalMembers(profile));
  const ctx = localContextFor(profile);
  return (
    <Suspense fallback={<WorkspaceFallback />}>
      <Workspace
        ctx={ctx}
        members={members}
        onProfileChange={(name) => {
          const next = { ...profile, name };
          const nextMembers = members.map((member) =>
            member.userId === profile.userId ? { ...member, name } : member,
          );
          saveLocalProfile(next);
          saveLocalMembers(nextMembers);
          setProfile(next);
          setMembers(nextMembers);
        }}
        onMembersChange={(next) => {
          saveLocalMembers(next);
          setMembers(next);
        }}
      />
    </Suspense>
  );
}
