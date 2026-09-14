import { TeamCard } from './team-card';

export default function EquipePage() {
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <h1 className="text-xl font-semibold text-text">Equipe</h1>
      <div className="mt-4">
        <TeamCard />
      </div>
    </div>
  );
}
