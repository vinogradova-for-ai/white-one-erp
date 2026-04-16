export function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
        <div className="mb-2 text-4xl">🚧</div>
        <p className="text-lg font-medium text-slate-900">В разработке</p>
        <p className="mt-1 text-sm text-slate-500">Этот раздел появится в {phase}.</p>
      </div>
    </div>
  );
}
