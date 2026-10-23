import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center animate-fade-in">
      <div className="relative mb-5">
        <div className="absolute inset-0 -m-3 rounded-full bg-brand-50" />
        <div className="relative flex size-14 items-center justify-center rounded-2xl border border-ink-200 bg-white text-brand-600 shadow-card">
          {icon}
        </div>
      </div>
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
