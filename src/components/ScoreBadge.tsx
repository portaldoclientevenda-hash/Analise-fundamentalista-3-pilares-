import React from 'react';
import { AlertCircle, AlertTriangle, Info, ShieldAlert } from 'lucide-react';

export function ScoreBar({
  label,
  score,
  coverage,
  subtitle,
}: {
  label: string;
  score: number;
  coverage?: number;
  subtitle?: string;
}) {
  const barColor =
    score >= 75
      ? 'bg-emerald-600 dark:bg-emerald-500'
      : score >= 55
        ? 'bg-amber-500'
        : 'bg-rose-600 dark:bg-rose-500';
  const textColor =
    score >= 75
      ? 'text-emerald-700 dark:text-emerald-400'
      : score >= 55
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-rose-700 dark:text-rose-400';

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
          {label}
        </span>
        <span className={`font-mono tabular-nums text-xl font-bold shrink-0 ${textColor}`}>
          {score}
          <span className="text-xs font-normal text-slate-400">/100</span>
        </span>
      </div>
      <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-200 ${barColor}`}
          style={{ width: `${Math.max(2, Math.min(100, score))}%` }}
        />
      </div>
      {(subtitle || coverage !== undefined) && (
        <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="truncate">{subtitle ?? ''}</span>
          {coverage !== undefined && (
            <span className="font-mono tabular-nums shrink-0">Cobertura {coverage}%</span>
          )}
        </div>
      )}
    </div>
  );
}

export function SeverityTag({
  severity,
}: {
  severity: 'informativo' | 'atencao' | 'alto_risco' | 'critico';
}) {
  const config: Record<
    string,
    { text: string; label: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    critico: {
      text: 'text-rose-700 dark:text-rose-400',
      label: 'Crítico',
      Icon: ShieldAlert,
    },
    alto_risco: {
      text: 'text-orange-700 dark:text-orange-400',
      label: 'Alto Risco',
      Icon: AlertTriangle,
    },
    atencao: {
      text: 'text-amber-700 dark:text-amber-400',
      label: 'Atenção',
      Icon: AlertCircle,
    },
    informativo: {
      text: 'text-slate-600 dark:text-slate-400',
      label: 'Informativo',
      Icon: Info,
    },
  };

  const item = config[severity] ?? config.informativo;
  const Icon = item.Icon;

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold whitespace-nowrap shrink-0 ${item.text}`}>
      <Icon className="w-3.5 h-3.5" />
      <span>{item.label}</span>
    </span>
  );
}
