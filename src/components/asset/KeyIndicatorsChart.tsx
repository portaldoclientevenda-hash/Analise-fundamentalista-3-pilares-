import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart2, ChevronDown, ChevronUp } from 'lucide-react';
import { formatNumberPtBr, isFiniteNumber } from '../../engine/financial/mathUtils.ts';
import { IntegratedAssetAnalysis } from '../../engine/integrated/integratedEngine.ts';
import { IndicatorDiagnostic } from '../../engine/types.ts';

interface TimeSeriesPoint {
  period: string;
  roePct: number | null;
  margemLiquidaPct: number | null;
  dividaLiquidaEbitda: number | null;
}

export function KeyIndicatorsChart({
  analysis,
  onSelectIndicator,
  defaultCollapsed = false,
}: {
  analysis: IntegratedAssetAnalysis;
  onSelectIndicator: (ind: IndicatorDiagnostic) => void;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [visibleSeries, setVisibleSeries] = useState({
    roe: true,
    margemLiquida: true,
    dividaLiquidaEbitda: true,
  });

  const fin = analysis.financial;
  const roeDiag = fin.indicators.roe;
  const netMarginDiag = fin.indicators.margem_liquida;
  const netDebtDiag = fin.indicators.divida_liquida_ebitda;
  const debtApplicable = netDebtDiag?.status !== 'not_applicable';

  const chartData: TimeSeriesPoint[] = useMemo(() => {
    const periods = fin.historicalSeries.slice(-5);
    const roeMap = new Map(
      (roeDiag?.history ?? []).map((h) => [h.period, h.value])
    );
    const marginMap = new Map(
      (netMarginDiag?.history ?? []).map((h) => [h.period, h.value])
    );
    const debtMap = new Map(
      (netDebtDiag?.history ?? []).map((h) => [h.period, h.value])
    );

    return periods.map((row) => ({
      period: row.period,
      roePct: roeMap.has(row.period) ? (roeMap.get(row.period) ?? null) : row.roePct,
      margemLiquidaPct: marginMap.has(row.period)
        ? (marginMap.get(row.period) ?? null)
        : row.margemLiquidaPct,
      dividaLiquidaEbitda: debtApplicable
        ? debtMap.has(row.period)
          ? (debtMap.get(row.period) ?? null)
          : row.dividaLiquida !== null && row.ebitda !== null && row.ebitda > 0
            ? row.dividaLiquida / row.ebitda
            : null
        : null,
    }));
  }, [fin.historicalSeries, roeDiag, netMarginDiag, netDebtDiag, debtApplicable]);

  const causalReading = useMemo(() => {
    const validRoe = chartData.filter((d) => isFiniteNumber(d.roePct));
    const validMargin = chartData.filter((d) => isFiniteNumber(d.margemLiquidaPct));
    const validDebt = chartData.filter((d) => isFiniteNumber(d.dividaLiquidaEbitda));

    const parts: string[] = [];
    if (validRoe.length >= 2) {
      const first = validRoe[0];
      const last = validRoe[validRoe.length - 1];
      const delta = (last.roePct ?? 0) - (first.roePct ?? 0);
      parts.push(
        `ROE ${delta >= 0 ? 'avançou' : 'recuou'} ${Math.abs(delta).toFixed(1)} p.p. (${first.period}: ${first.roePct!.toFixed(1)}% → ${last.period}: ${last.roePct!.toFixed(1)}%), indicando ${
          delta >= 0
            ? 'maior eficiência do capital próprio e suporte direto à criação de valor'
            : 'menor retorno ao acionista ou expansão patrimonial sem ganho proporcional de lucro'
        }.`
      );
    }
    if (validMargin.length >= 2) {
      const first = validMargin[0];
      const last = validMargin[validMargin.length - 1];
      const delta = (last.margemLiquidaPct ?? 0) - (first.margemLiquidaPct ?? 0);
      parts.push(
        `Margem Líquida variou ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} p.p. (${first.margemLiquidaPct!.toFixed(1)}% → ${last.margemLiquidaPct!.toFixed(1)}%), o que ${
          delta >= 0
            ? 'reforça o poder de repasse/escala e sustenta margens projetadas maiores no DCF'
            : 'pressiona o lucro líquido e reduz a margem EBIT projetada no valuation'
        }.`
      );
    }
    if (debtApplicable && validDebt.length >= 2) {
      const first = validDebt[0];
      const last = validDebt[validDebt.length - 1];
      const delta = (last.dividaLiquidaEbitda ?? 0) - (first.dividaLiquidaEbitda ?? 0);
      parts.push(
        `Alavancagem (Dív. Líq./EBITDA) foi de ${first.dividaLiquidaEbitda!.toFixed(2)}x para ${last.dividaLiquidaEbitda!.toFixed(2)}x (${
          delta <= 0
            ? 'desalavancagem reduz despesa financeira e aumenta o Equity Value no DCF'
            : 'alta da dívida exige acompanhamento da cobertura de juros e eleva risco financeiro'
        }).`
      );
    }
    return parts.join(' ');
  }, [chartData, debtApplicable]);

  const toggleSeries = (key: keyof typeof visibleSeries) => {
    setVisibleSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Evolução Histórica (Últimos {chartData.length} Períodos) — Principais Indicadores
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            ROE (%) e Margem Líquida (%) no eixo esquerdo · Dívida Líquida / EBITDA (x) no eixo direito
            {!debtApplicable ? ' (Dív. Líq./EBITDA N/A para este setor).' : '.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => toggleSeries('roe')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium cursor-pointer transition-colors ${
              visibleSeries.roe
                ? 'border-teal-600 bg-teal-50/70 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-400'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-teal-600" />
            ROE (%)
          </button>

          <button
            type="button"
            onClick={() => toggleSeries('margemLiquida')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium cursor-pointer transition-colors ${
              visibleSeries.margemLiquida
                ? 'border-sky-600 bg-sky-50/70 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-400'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-sky-600" />
            Margem Líquida (%)
          </button>

          {debtApplicable && (
            <button
              type="button"
              onClick={() => toggleSeries('dividaLiquidaEbitda')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium cursor-pointer transition-colors ${
                visibleSeries.dividaLiquidaEbitda
                  ? 'border-amber-600 bg-amber-50/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-400'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-600" />
              Dív. Líq./EBITDA (x)
            </button>
          )}

          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="p-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
            title={collapsed ? 'Expandir gráfico' : 'Recolher gráfico'}
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 8, right: debtApplicable ? 16 : 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <YAxis
                  yAxisId="pct"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                  width={46}
                />
                {debtApplicable && (
                  <YAxis
                    yAxisId="mult"
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#d97706' }}
                    tickFormatter={(v: number) => `${v.toFixed(1)}x`}
                    width={46}
                  />
                )}
                <ReferenceLine yAxisId="pct" y={0} stroke="#94a3b8" strokeDasharray="2 2" />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const row = payload[0]?.payload as TimeSeriesPoint | undefined;
                    if (!row) return null;
                    return (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 shadow-lg text-xs space-y-1.5">
                        <div className="font-mono font-bold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-1">
                          Período {label}
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-teal-700 dark:text-teal-400">ROE:</span>
                          <span className="font-mono tabular-nums font-semibold">
                            {isFiniteNumber(row.roePct) ? `${formatNumberPtBr(row.roePct, 2)}%` : 'N/D'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-sky-700 dark:text-sky-400">Margem Líquida:</span>
                          <span className="font-mono tabular-nums font-semibold">
                            {isFiniteNumber(row.margemLiquidaPct)
                              ? `${formatNumberPtBr(row.margemLiquidaPct, 2)}%`
                              : 'N/D'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-amber-700 dark:text-amber-400">Dív. Líq./EBITDA:</span>
                          <span className="font-mono tabular-nums font-semibold">
                            {!debtApplicable
                              ? 'N/A (setorial)'
                              : isFiniteNumber(row.dividaLiquidaEbitda)
                                ? `${formatNumberPtBr(row.dividaLiquidaEbitda, 2)}x`
                                : 'Indisp. (EBITDA <= 0)'}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
                {visibleSeries.roe && (
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="roePct"
                    name="ROE (%)"
                    stroke="#0f766e"
                    strokeWidth={2.25}
                    dot={{ r: 3.5, fill: '#0f766e' }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                  />
                )}
                {visibleSeries.margemLiquida && (
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="margemLiquidaPct"
                    name="Margem Líquida (%)"
                    stroke="#0284c7"
                    strokeWidth={2.25}
                    dot={{ r: 3.5, fill: '#0284c7' }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                  />
                )}
                {debtApplicable && visibleSeries.dividaLiquidaEbitda && (
                  <Line
                    yAxisId="mult"
                    type="monotone"
                    dataKey="dividaLiquidaEbitda"
                    name="Dívida Líquida / EBITDA (x)"
                    stroke="#d97706"
                    strokeWidth={2.25}
                    strokeDasharray="5 3"
                    dot={{ r: 3.5, fill: '#d97706' }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-3 text-xs">
            <div className="flex flex-wrap gap-3 font-mono tabular-nums text-slate-600 dark:text-slate-300">
              {roeDiag && (
                <button
                  type="button"
                  onClick={() => onSelectIndicator(roeDiag)}
                  className="hover:text-teal-700 dark:hover:text-teal-400 underline decoration-slate-300 dark:decoration-slate-700 underline-offset-2 cursor-pointer"
                >
                  ROE Atual: {isFiniteNumber(roeDiag.value) ? `${formatNumberPtBr(roeDiag.value, 2)}%` : 'N/D'}
                </button>
              )}
              {netMarginDiag && (
                <button
                  type="button"
                  onClick={() => onSelectIndicator(netMarginDiag)}
                  className="hover:text-sky-700 dark:hover:text-sky-400 underline decoration-slate-300 dark:decoration-slate-700 underline-offset-2 cursor-pointer"
                >
                  Margem Líq.: {isFiniteNumber(netMarginDiag.value) ? `${formatNumberPtBr(netMarginDiag.value, 2)}%` : 'N/D'}
                </button>
              )}
              {netDebtDiag && (
                <button
                  type="button"
                  onClick={() => onSelectIndicator(netDebtDiag)}
                  className="hover:text-amber-700 dark:hover:text-amber-400 underline decoration-slate-300 dark:decoration-slate-700 underline-offset-2 cursor-pointer"
                >
                  Dív. Líq./EBITDA: {!debtApplicable ? 'N/A' : isFiniteNumber(netDebtDiag.value) ? `${formatNumberPtBr(netDebtDiag.value, 2)}x` : 'Indisp.'}
                </button>
              )}
            </div>
            <span className="text-[11px] text-slate-400">
              Clique nos indicadores acima para abrir o diagnóstico de 10 pontos
            </span>
          </div>

          {causalReading && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 px-3.5 py-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong className="text-slate-800 dark:text-slate-100">
                Leitura causal da série (Por quê & Influência Direta):
              </strong>{' '}
              {causalReading}
            </div>
          )}
        </>
      )}
    </div>
  );
}
