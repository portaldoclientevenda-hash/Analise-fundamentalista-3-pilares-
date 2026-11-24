import React, { useState } from 'react';
import { RefreshCw, RotateCcw } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { IntegratedAssetAnalysis } from '../../engine/integrated/integratedEngine.ts';
import { ValuationAssumptions } from '../../engine/types.ts';

type ValSubTab =
  | 'dcf'
  | 'fcfe'
  | 'ddm'
  | 'multiplos'
  | 'nav'
  | 'reverse_dcf'
  | 'cenarios'
  | 'sensibilidade'
  | 'premissas'
  | 'reconciliacao';

const SUB_TABS: Array<{ id: ValSubTab; label: string }> = [
  { id: 'reconciliacao', label: 'Reconciliação' },
  { id: 'cenarios', label: '3 Cenários' },
  { id: 'dcf', label: 'DCF (FCFF)' },
  { id: 'fcfe', label: 'FCFE (Ke)' },
  { id: 'ddm', label: 'DDM (1/2/3 Estágios)' },
  { id: 'multiplos', label: 'Múltiplos' },
  { id: 'nav', label: 'Patrimônio / NAV' },
  { id: 'reverse_dcf', label: 'Reverse DCF' },
  { id: 'sensibilidade', label: 'Sensibilidade 2D' },
  { id: 'premissas', label: 'Premissas Interativas' },
];

export function ValuationTab({
  analysis,
  overrides,
  liveSelicPct,
  onChangeOverrides,
  onResetOverrides,
  onSaveOverrides,
  canEdit,
}: {
  analysis: IntegratedAssetAnalysis;
  overrides: Partial<ValuationAssumptions>;
  liveSelicPct: number | null;
  onChangeOverrides: (next: Partial<ValuationAssumptions>) => void;
  onResetOverrides: () => void;
  onSaveOverrides: () => void;
  canEdit: boolean;
}) {
  const [subTab, setSubTab] = useState<ValSubTab>('reconciliacao');
  const v = analysis.valuation;
  const a = v.assumptionsUsed;

  const updateField = (field: keyof ValuationAssumptions, val: number) => {
    if (!Number.isFinite(val)) return;
    onChangeOverrides({ ...overrides, [field]: val });
  };

  return (
    <div className="space-y-5">
      {/* Valuation Top Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
          <div className="text-xs text-slate-500">Valor Justo Reconciliado</div>
          <div className="font-mono tabular-nums text-xl font-bold text-teal-700 dark:text-teal-400 mt-1">
            R$ {v.reconciledFairValue.toFixed(2)}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
          <div className="text-xs text-slate-500">Potencial (Upside)</div>
          <div className="font-mono tabular-nums text-xl font-bold mt-1">
            {v.upsidePct >= 0 ? '+' : ''}
            {v.upsidePct.toFixed(1)}%
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
          <div className="text-xs text-slate-500">Margem de Segurança</div>
          <div className="font-mono tabular-nums text-xl font-bold mt-1">
            {v.marginOfSafetyPct.toFixed(1)}%
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
          <div className="text-xs text-slate-500">Ke (CAPM) / WACC</div>
          <div className="font-mono tabular-nums text-base font-bold mt-1.5">
            {v.kePct.toFixed(2)}% / {v.waccPct.toFixed(2)}%
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
          <div className="text-xs text-slate-500">Confiança do Modelo</div>
          <div className="font-semibold text-base mt-1.5">{v.confidenceLevel}</div>
        </div>
      </div>

      {/* 10 Sub-tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              subTab === t.id
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'reconciliacao' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Metodologia</th>
                  <th className="text-right px-3 py-3">Valor Justo</th>
                  <th className="text-right px-3 py-3">Peso Setorial</th>
                  <th className="text-left px-4 py-3">Fundamentação / Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {v.modelsTable.map((m) => (
                  <tr key={m.modelId} className={!m.applicable ? 'opacity-60' : ''}>
                    <td className="px-4 py-2.5 font-medium">{m.label}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold">
                      {m.applicable && m.fairValuePerShare !== null
                        ? `R$ ${m.fairValuePerShare.toFixed(2)}`
                        : 'N/A'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {(m.weight * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                      {m.rationale} · {m.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs space-y-2">
            <h4 className="font-semibold text-slate-900 dark:text-slate-100">
              Por que deu R$ {v.reconciledFairValue.toFixed(2)} & Como cada parâmetro influencia o preço justo
            </h4>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong>Custo de Capital (Ke {v.kePct.toFixed(2)}% / WACC {v.waccPct.toFixed(2)}%):</strong>{' '}
              Calculado por Rf ({a.rfPct}% via {a.rfSource}) + Beta ({a.beta}) × ERP ({a.rmMinusRfPct}%) + Spread Qualitativo ({analysis.qualitative.qualitativeRiskSpreadBps >= 0 ? '+' : ''}{analysis.qualitative.qualitativeRiskSpreadBps} bps). Quanto maior a Selic, o Beta ou os riscos qualitativos, maior a taxa de desconto e <strong>menor</strong> o valor presente dos fluxos futuros.
            </p>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong>Peso dos Fluxos & Sensibilidade:</strong>{' '}
              O cenário base concentra <strong>{v.scenarios.base.terminalValueSharePct.toFixed(1)}%</strong> do valor da firma no Valor Terminal (perpetuidade com g = {a.revenueGrowthTerminalPct}%), e o crescimento operacional recebe multiplicador qualitativo de <strong>{analysis.qualitative.growthSustainabilityFactor.toFixed(2)}x</strong> (moat "{analysis.qualitative.moatStrengthOverall.replace(/_/g, ' ')}").
            </p>
          </div>

          {v.sectorSpecificNotes.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs space-y-1.5">
              <h4 className="font-semibold">Notas de Especialização Setorial</h4>
              {v.sectorSpecificNotes.map((n, i) => (
                <p key={i} className="text-slate-600 dark:text-slate-300">
                  • {n}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === 'cenarios' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['conservador', 'base', 'otimista'] as const).map((k) => {
              const sc = v.scenarios[k];
              return (
                <div
                  key={k}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">{sc.name}</span>
                    <span className="font-mono text-lg font-bold text-teal-700 dark:text-teal-400">
                      R$ {sc.fairValuePerShare.toFixed(2)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px] text-slate-500">
                    <span>CAGR Rec: {sc.revenueCagrPct.toFixed(1)}%</span>
                    <span>Mg. EBIT: {sc.ebitMarginTargetPct.toFixed(1)}%</span>
                    <span>WACC: {sc.waccPct.toFixed(2)}%</span>
                    <span>g: {sc.terminalGrowthPct.toFixed(2)}%</span>
                    <span>Upside: {sc.upsidePct.toFixed(1)}%</span>
                    <span>MoS: {sc.marginOfSafetyPct.toFixed(1)}%</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 pt-1">{sc.rationale}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {subTab === 'dcf' && (
        <div className="space-y-4">
          {v.dcfFcffFairValue === null ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-xs text-slate-500">
              DCF via FCFF tradicional marcado como N/A para este setor ({analysis.sectorName}). Utilize Residual Income, DDM ou modelo setorial na aba Reconciliação.
            </div>
          ) : (
            <>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <h4 className="text-xs font-semibold mb-3">
                  Projeção Explícita FCFF & Valor Presente — Cenário Base (R$ mi)
                </h4>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={v.scenarios.base.projectedYears}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
                      <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="fcff" name="FCFF" fill="#0f766e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="pvFcff" name="VP do FCFF" fill="#0284c7" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
                <table className="w-full text-xs font-mono tabular-nums">
                  <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="text-left px-3 py-2.5">Ano</th>
                      <th className="text-right px-3 py-2.5">Receita</th>
                      <th className="text-right px-3 py-2.5">EBIT</th>
                      <th className="text-right px-3 py-2.5">NOPAT</th>
                      <th className="text-right px-3 py-2.5">CAPEX</th>
                      <th className="text-right px-3 py-2.5">FCFF</th>
                      <th className="text-right px-3 py-2.5">VP FCFF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {v.scenarios.base.projectedYears.map((y) => (
                      <tr key={y.year}>
                        <td className="px-3 py-2">Ano {y.year}</td>
                        <td className="px-3 py-2 text-right">{y.revenue.toFixed(0)}</td>
                        <td className="px-3 py-2 text-right">{y.ebit.toFixed(0)}</td>
                        <td className="px-3 py-2 text-right">{y.nopat.toFixed(0)}</td>
                        <td className="px-3 py-2 text-right">{y.capex.toFixed(0)}</td>
                        <td className="px-3 py-2 text-right">{y.fcff.toFixed(0)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{y.pvFcff.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {subTab === 'fcfe' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-xs space-y-2">
          <h3 className="text-sm font-semibold">Fluxo de Caixa do Acionista (FCFE descontado estritamente pelo Ke)</h3>
          <div className="font-mono text-2xl font-bold text-teal-700 dark:text-teal-400">
            {v.fcfeFairValue !== null ? `R$ ${v.fcfeFairValue.toFixed(2)}` : 'N/A'}
          </div>
          <p className="text-slate-600 dark:text-slate-300">
            Custo do Capital Próprio (Ke via CAPM): <strong>{v.kePct.toFixed(2)}%</strong> · Taxa livre de risco ({a.rfPct}% via {a.rfSource}) + Beta ({a.beta}) × ERP ({a.rmMinusRfPct}%) + Spread Qualitativo ({analysis.qualitative.qualitativeRiskSpreadBps} bps). Nunca descontado por WACC.
          </p>
        </div>
      )}

      {subTab === 'ddm' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {[
            { label: 'Gordon (1 Estágio)', val: v.ddmDetails.gordon },
            { label: 'DDM 2 Estágios', val: v.ddmDetails.twoStage },
            { label: 'DDM 3 Estágios (H-Model)', val: v.ddmDetails.threeStage },
          ].map((d) => (
            <div
              key={d.label}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4"
            >
              <div className="text-slate-500">{d.label}</div>
              <div className="font-mono text-2xl font-bold mt-1">
                {d.val !== null ? `R$ ${d.val.toFixed(2)}` : 'N/A'}
              </div>
              <div className="text-slate-500 mt-1">
                Payout normalizado: {v.ddmDetails.payoutPct ?? 'N/D'}%
              </div>
            </div>
          ))}
        </div>
      )}

      {subTab === 'multiplos' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {[
            { label: 'P/L Justo', val: v.multiplesBreakdown.peFair, note: a.referencePeRationale },
            { label: 'EV/EBITDA Justo', val: v.multiplesBreakdown.evEbitdaFair, note: a.referenceEvEbitdaRationale },
            { label: 'P/VP Justo', val: v.multiplesBreakdown.pvpFair, note: a.referencePvpRationale },
          ].map((m) => (
            <div
              key={m.label}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1.5"
            >
              <div className="text-slate-500">{m.label}</div>
              <div className="font-mono text-2xl font-bold">
                {m.val !== null ? `R$ ${m.val.toFixed(2)}` : 'N/A'}
              </div>
              <p className="text-slate-600 dark:text-slate-300">{m.note}</p>
            </div>
          ))}
        </div>
      )}

      {subTab === 'nav' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
            <h4 className="font-semibold text-sm">NAV / Patrimônio Líquido Ajustado</h4>
            <div className="font-mono text-2xl font-bold">
              {v.navFairValue !== null ? `R$ ${v.navFairValue.toFixed(2)}` : 'N/A'}
            </div>
            <p className="text-slate-600 dark:text-slate-300">
              Considera ativos não operacionais (R$ {a.nonOperatingAssetsBrl} mi) e contingências (R$ {a.contingenciesAdjustmentBrl} mi).
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
            <h4 className="font-semibold text-sm">Residual Income (Lucro Residual sobre PL)</h4>
            <div className="font-mono text-2xl font-bold">
              {v.residualIncomeFairValue !== null ? `R$ ${v.residualIncomeFairValue.toFixed(2)}` : 'N/A'}
            </div>
            <p className="text-slate-600 dark:text-slate-300">
              Mede criação de valor além do custo de oportunidade Ke sobre o patrimônio contábil.
            </p>
          </div>
        </div>
      )}

      {subTab === 'reverse_dcf' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Reverse DCF — O que o preço atual está embutindo</h3>
            <span className="font-mono px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700">
              {v.reverseDcf.marketExpectationAssessment}
            </span>
          </div>
          {v.reverseDcf.applicable ? (
            <div className="space-y-2">
              <div className="font-mono text-2xl font-bold">
                CAGR Implícito na Cotação: {v.reverseDcf.impliedRevenueCagrPct?.toFixed(1)}% a.a.
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                {v.reverseDcf.explanation}
              </p>
            </div>
          ) : (
            <p className="text-slate-500">{v.reverseDcf.explanation}</p>
          )}
        </div>
      )}

      {subTab === 'sensibilidade' && (
        <div className="space-y-4">
          {[v.sensitivityWaccVsG, v.sensitivityGrowthVsMargin, v.sensitivityCapexVsWc].map((mat) => (
            <div
              key={mat.title}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 overflow-x-auto"
            >
              <h4 className="text-xs font-semibold mb-3">{mat.title}</h4>
              <table className="w-full text-xs font-mono tabular-nums">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-2 text-slate-500">
                      {mat.rowLabel} \ {mat.colLabel}
                    </th>
                    {mat.colValues.map((c, ci) => (
                      <th key={ci} className="text-right py-2 px-2">
                        {c.toFixed(1)}%
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {mat.cells.map((row, ri) => (
                    <tr key={ri}>
                      <td className="py-2 px-2 font-semibold">{mat.rowValues[ri].toFixed(1)}%</td>
                      {row.map((cell, ci) => {
                        const upside = cell >= v.currentPrice;
                        return (
                          <td
                            key={ci}
                            className={`py-2 px-2 text-right rounded ${
                              upside
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-rose-700 dark:text-rose-400'
                            }`}
                          >
                            R$ {cell.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {subTab === 'premissas' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Editor Interativo de Premissas de Valuation</h3>
              <p className="text-xs text-slate-500">
                Ajuste taxas e crescimento para recalcular DCF, FCFE, DDM, cenários e nota em tempo real.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {liveSelicPct !== null && (
                <button
                  type="button"
                  onClick={() => updateField('rfPct', Number(liveSelicPct.toFixed(2)))}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Usar Selic BCB ({liveSelicPct.toFixed(2)}%) como Rf
                </button>
              )}
              <button
                type="button"
                onClick={onResetOverrides}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restaurar Padrão
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={onSaveOverrides}
                  className="px-3 py-1.5 rounded-lg bg-teal-700 text-white text-xs font-medium hover:bg-teal-800 cursor-pointer"
                >
                  Salvar na Organização
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {[
              { key: 'rfPct' as const, label: 'Taxa Livre de Risco Rf (%)', step: 0.25 },
              { key: 'beta' as const, label: 'Beta Alavancado', step: 0.05 },
              { key: 'rmMinusRfPct' as const, label: 'Prêmio de Risco ERP (%)', step: 0.25 },
              { key: 'kdPreTaxPct' as const, label: 'Custo Dívida Pré-IR (%)', step: 0.25 },
              { key: 'revenueGrowthBasePct' as const, label: 'Crescimento Receita Base (%)', step: 0.5 },
              { key: 'ebitMarginTargetPct' as const, label: 'Margem EBIT Alvo (%)', step: 0.5 },
              { key: 'revenueGrowthTerminalPct' as const, label: 'Crescimento Perpétuo g (%)', step: 0.25 },
              { key: 'desiredMarginOfSafetyPct' as const, label: 'Margem Segurança Mín. (%)', step: 2.5 },
            ].map((f) => (
              <label key={f.key} className="block space-y-1">
                <span className="text-slate-600 dark:text-slate-300 font-medium">{f.label}</span>
                <input
                  type="number"
                  step={f.step}
                  value={a[f.key] as number}
                  onChange={(e) => updateField(f.key, Number(e.target.value))}
                  className="w-full font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </label>
            ))}
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-3.5 text-xs text-slate-600 dark:text-slate-300 space-y-1">
            <div>
              <strong>Influência direta das premissas:</strong> Subir <strong>Rf, Beta, ERP ou Custo da Dívida</strong> aumenta o WACC/Ke e reduz o Valor Justo.
            </div>
            <div>
              Subir <strong>Crescimento de Receita, Margem EBIT Alvo ou g Perpétuo</strong> aumenta o NOPAT e FCFF futuros, elevando o Valor Justo — use a aba <em>Sensibilidade 2D</em> para medir a elasticidade exata.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
