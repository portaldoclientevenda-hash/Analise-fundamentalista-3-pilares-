import React from 'react';
import { X } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatIndicatorValue } from '../engine/financial/mathUtils.ts';
import { buildIndicatorDirectImpact } from '../engine/integrated/interpretationEngine.ts';
import { IndicatorDiagnostic } from '../engine/types.ts';

export function IndicatorModal({
  indicator,
  onClose,
}: {
  indicator: IndicatorDiagnostic | null;
  onClose: () => void;
}) {
  if (!indicator) return null;

  const directImpact = buildIndicatorDirectImpact(indicator);
  const chartData = indicator.history.map((h) => ({
    period: h.period,
    value: h.value,
  }));

  const tenPoints: Array<{ num: string; title: string; body: string }> = [
    { num: '1', title: 'O que mede', body: indicator.tenPointExplanation.oQueMede },
    { num: '2', title: 'Fórmula exata', body: indicator.tenPointExplanation.formula },
    { num: '3', title: 'Resultado atual', body: indicator.tenPointExplanation.resultado },
    { num: '4', title: 'Evolução histórica', body: indicator.tenPointExplanation.evolucao },
    { num: '5', title: 'Significado econômico', body: indicator.tenPointExplanation.significado },
    { num: '6', title: 'Importância setorial', body: indicator.tenPointExplanation.importanciaSetorial },
    { num: '7', title: 'Fatores explicativos', body: indicator.tenPointExplanation.fatoresExplicativos },
    { num: '8', title: 'Consequências práticas', body: indicator.tenPointExplanation.consequencias },
    { num: '9', title: 'Riscos e limitações', body: indicator.tenPointExplanation.riscos },
    { num: '10', title: 'Conclusão', body: indicator.tenPointExplanation.conclusao },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Diagnóstico em 10 Pontos · {indicator.category.replace(/_/g, ' ').toUpperCase()} · Ref. {indicator.provenance.referencePeriod}
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              {indicator.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="text-xs text-slate-500">Valor Atual</div>
              <div className="font-mono tabular-nums text-lg font-bold mt-1">
                {indicator.status === 'not_applicable'
                  ? 'N/A'
                  : formatIndicatorValue(indicator.value, indicator.unit)}
              </div>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="text-xs text-slate-500">Média Histórica</div>
              <div className="font-mono tabular-nums text-lg font-semibold mt-1">
                {formatIndicatorValue(indicator.historicalMean, indicator.unit)}
              </div>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="text-xs text-slate-500">Mediana Histórica</div>
              <div className="font-mono tabular-nums text-lg font-semibold mt-1">
                {formatIndicatorValue(indicator.historicalMedian, indicator.unit)}
              </div>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="text-xs text-slate-500">Variação YoY</div>
              <div className="font-mono tabular-nums text-lg font-semibold mt-1">
                {indicator.yoyVariationPct !== null
                  ? `${indicator.yoyVariationPct >= 0 ? '+' : ''}${indicator.yoyVariationPct.toFixed(1)}%`
                  : 'N/D'}
              </div>
            </div>
          </div>

          <div className="border border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/30 rounded-lg p-4 space-y-2 text-xs">
            <div className="font-semibold text-teal-800 dark:text-teal-300">
              Por que esse resultado & Como influencia diretamente a análise
            </div>
            <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
              <strong>Por que deu esse valor:</strong> {directImpact.whyCurrentValue}
            </p>
            <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
              <strong>Influência direta:</strong> {directImpact.directInfluence}
            </p>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
              <strong>Ponto de gatilho / atenção:</strong> {directImpact.watchTrigger}
            </p>
          </div>

          {chartData.some((d) => d.value !== null) && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <div className="text-xs font-medium text-slate-500 mb-3">
                Série Histórica ({indicator.provenance.source})
              </div>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(val: unknown) =>
                        typeof val === 'number'
                          ? formatIndicatorValue(val, indicator.unit)
                          : String(val)
                      }
                    />
                    <Bar dataKey="value" fill="#0f766e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tenPoints.map((p) => (
              <div
                key={p.num}
                className="border border-slate-200 dark:border-slate-800 rounded-lg p-3.5"
              >
                <div className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                  {p.num}. {p.title}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                  {p.body}
                </p>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-3 text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
            <span>Fonte: {indicator.provenance.source}</span>
            <span>Divulgação: {indicator.provenance.disclosureDate}</span>
            <span>Metodologia: {indicator.provenance.methodology}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
