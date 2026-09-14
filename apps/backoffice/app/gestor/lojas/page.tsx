import { StoreListCard } from './store-list-card';

export default function LojasPage() {
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <h1 className="text-xl font-semibold text-text">Lojas</h1>
      <div className="mt-4">
        <StoreListCard />
      </div>
    </div>
  );
}
