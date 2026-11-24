import React, { useMemo } from 'react';
import { AlertTriangle, Award, CheckCircle2, Download, FileSpreadsheet, Scale } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatIndicatorValue } from '../engine/financial/mathUtils.ts';
import { compareAssets } from '../engine/integrated/compareEngine.ts';
import { IntegratedAssetAnalysis } from '../engine/integrated/integratedEngine.ts';
import { exportComparisonToCsv } from '../utils/csvExport.ts';
import { exportComparisonPdfReport } from '../utils/pdfReport.ts';

export function PeerComparator({
  allAnalyses,
  selectedTickers,
  onToggleTicker,
  orgName,
}: {
  allAnalyses: IntegratedAssetAnalysis[];
  selectedTickers: string[];
  onToggleTicker: (ticker: string) => void;
  orgName: string;
}) {
  const chosen = useMemo(
    () => allAnalyses.filter((a) => selectedTickers.includes(a.asset.ticker)).slice(0, 4),
    [allAnalyses, selectedTickers]
  );
  const verdict = useMemo(() => compareAssets(chosen), [chosen]);

  const chartData = chosen.map((a) => ({
    ticker: a.asset.ticker,
    Financeiro: a.scores.financial.pillarScore,
    Qualitativo: a.scores.qualitative.pillarScore,
    Valuation: a.scores.valuation.pillarScore,
    Geral: a.scores.overallScore,
  }));

  const rows: Array<{
    key: string;
    label: string;
    whyMatters?: string;
    get: (a: IntegratedAssetAnalysis) => string;
  }> = [
    {
      key: 'sector',
      label: 'Setor B3',
      get: (a) => a.sectorName,
    },
    {
      key: 'price',
      label: 'Cotação Atual',
      get: (a) => `R$ ${a.valuation.currentPrice.toFixed(2)}`,
    },
    {
      key: 'fair',
      label: 'Valor Justo Reconciliado',
      whyMatters: 'Valor intrínseco ponderado pelos métodos válidos do setor',
      get: (a) => `R$ ${a.valuation.reconciledFairValue.toFixed(2)}`,
    },
    {
      key: 'mos',
      label: 'Margem de Segurança',
      whyMatters: 'Maior = maior colchão contra erros de projeção',
      get: (a) => `${a.valuation.marginOfSafetyPct.toFixed(1)}%`,
    },
    {
      key: 'overall',
      label: 'Nota Geral / Cobertura',
      whyMatters: 'Combina 35% Fin. + 35% Qual. + 30% Val.',
      get: (a) => `${a.scores.overallScore}/100 (${a.scores.overallDataCoveragePct}%)`,
    },
    {
      key: 'fin',
      label: 'Nota Financeira',
      whyMatters: 'Liquidez, dívida, retorno, caixa e accruals',
      get: (a) => `${a.scores.financial.pillarScore}/100`,
    },
    {
      key: 'qual',
      label: 'Nota Qualitativa',
      whyMatters: 'Moat, gestão, governança e 5 forças de Porter',
      get: (a) => `${a.scores.qualitative.pillarScore}/100`,
    },
    {
      key: 'val',
      label: 'Nota Valuation',
      whyMatters: 'Upside, margem de segurança e consistência',
      get: (a) => `${a.scores.valuation.pillarScore}/100`,
    },
    {
      key: 'roe',
      label: 'ROE',
      whyMatters: 'Maior = maior retorno sobre o capital dos acionistas',
      get: (a) => formatIndicatorValue(a.financial.indicators.roe?.value ?? null, '%'),
    },
    {
      key: 'roic',
      label: 'ROIC',
      whyMatters: 'Maior = maior retorno operacional sobre capital investido',
      get: (a) =>
        a.financial.indicators.roic?.status === 'not_applicable'
          ? 'N/A'
          : formatIndicatorValue(a.financial.indicators.roic?.value ?? null, '%'),
    },
    {
      key: 'dl_ebitda',
      label: 'Dív. Líq./EBITDA',
      whyMatters: 'Menor = menor alavancagem e menor risco financeiro',
      get: (a) =>
        a.financial.indicators.divida_liquida_ebitda?.status === 'not_applicable'
          ? 'N/A'
          : formatIndicatorValue(a.financial.indicators.divida_liquida_ebitda?.value ?? null, 'x'),
    },
    {
      key: 'pl',
      label: 'P/L',
      whyMatters: 'Menor (positivo) = menos anos de lucro para pagar o preço',
      get: (a) => formatIndicatorValue(a.financial.indicators.pl?.value ?? null, 'x'),
    },
    {
      key: 'pvp',
      label: 'P/VP',
      whyMatters: 'Menor (positivo) = menor ágio sobre o patrimônio líquido',
      get: (a) => formatIndicatorValue(a.financial.indicators.pvp?.value ?? null, 'x'),
    },
    {
      key: 'dy',
      label: 'Dividend Yield',
      whyMatters: 'Maior = maior retorno direto em proventos (12m)',
      get: (a) => formatIndicatorValue(a.financial.indicators.dividend_yield?.value ?? null, '%'),
    },
    {
      key: 'moat',
      label: 'Moat Competitivo',
      get: (a) => a.qualitative.moatStrengthOverall.replace(/_/g, ' '),
    },
    {
      key: 'eq',
      label: 'Qualidade dos Lucros',
      get: (a) => a.financial.earningsQuality.classification,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Ticker Selector Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Comparador Lado a Lado (2 a 4 Ativos)</h2>
            <p className="text-xs text-slate-500">
              Selecione até 4 ativos para identificar qual é o melhor, entender o porquê em cada pilar e comparar métricas.
            </p>
          </div>
          {chosen.length >= 2 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => exportComparisonPdfReport(chosen, orgName)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                PDF Comparativo
              </button>
              <button
                type="button"
                onClick={() => exportComparisonToCsv(chosen)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                CSV Comparativo
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {allAnalyses.map((a) => {
            const active = selectedTickers.includes(a.asset.ticker);
            return (
              <button
                key={a.asset.ticker}
                type="button"
                onClick={() => onToggleTicker(a.asset.ticker)}
                className={`px-3 py-1.5 rounded-lg font-mono text-xs border transition-colors cursor-pointer ${
                  active
                    ? 'bg-teal-700 text-white border-teal-700'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {a.asset.ticker}
              </button>
            );
          })}
        </div>
      </div>

      {verdict?.hasIncompatibleTypes && (
        <div className="flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl p-4">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <strong>Alerta Metodológico de Comparabilidade:</strong> Você selecionou ativos com modelos contábeis distintos ({Array.from(new Set(chosen.map((c) => c.asset.assetType))).join(', ')}). Métricas corporativas como EV/EBITDA e ROIC aparecem como N/A em bancos, seguradoras e FIIs para impedir distorções comparativas.
          </div>
        </div>
      )}

      {!verdict ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500">
          Selecione ao menos 2 ativos acima para visualizar qual é o melhor, a explicação detalhada e a matriz comparativa.
        </div>
      ) : (
        <>
          {/* Head-to-Head Verdict & Causal Explanation Panel */}
          <div className="bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 rounded-xl overflow-hidden">
            <div className="p-5 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-start gap-3 max-w-3xl">
                <Award className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    Veredito do Comparador · 3 Pilares Integrados
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {verdict.headline}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {verdict.overallWhy}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
                {verdict.ranked.map((item, idx) => (
                  <span
                    key={item.asset.ticker}
                    className={
                      idx === 0
                        ? 'font-bold text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }
                  >
                    {idx + 1}º {item.asset.ticker} ({item.scores.overallScore})
                  </span>
                ))}
              </div>
            </div>

            {/* Pillar-by-pillar Duel (Hairline Divided) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800 text-xs">
              {verdict.pillarVerdicts.map((pv) => (
                <div key={pv.pillar} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      Pilar {pv.pillar}
                    </span>
                    <span
                      className={`font-mono text-xs font-semibold ${
                        pv.isTie
                          ? 'text-slate-500 dark:text-slate-400'
                          : 'text-teal-700 dark:text-teal-400'
                      }`}
                    >
                      {pv.isTie ? 'Empate' : `Melhor: ${pv.winnerTicker}`}
                    </span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                    <strong>Por quê:</strong> {pv.why}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    <strong>Influência direta:</strong> {pv.directImpact}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 px-5 py-3 text-xs text-slate-700 dark:text-slate-300">
              <Scale className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <span>{verdict.whenChooseRunnerUp}</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h3 className="text-xs font-semibold mb-3">Comparação das Notas por Pilar (0–100)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
                  <XAxis dataKey="ticker" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Financeiro" fill="#0f766e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Qualitativo" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Valuation" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Geral" fill="#0f172a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Indicador / Dimensão</th>
                  {chosen.map((c) => (
                    <th key={c.asset.ticker} className="text-right px-4 py-3 font-mono font-bold">
                      {c.asset.ticker}
                      {c.asset.ticker === verdict.best.asset.ticker && (
                        <span className="ml-1.5 text-[10px] font-sans font-semibold text-emerald-700 dark:text-emerald-400">
                          (1º)
                        </span>
                      )}
                    </th>
                  ))}
                  <th className="text-left px-4 py-3 font-semibold">Melhor & Por quê</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row) => {
                  const winnerTicker = verdict.metricWinners[row.key] ?? null;
                  return (
                    <tr key={row.key}>
                      <td className="px-4 py-2.5 font-medium">{row.label}</td>
                      {chosen.map((c) => {
                        const isWin = winnerTicker === c.asset.ticker;
                        return (
                          <td
                            key={c.asset.ticker}
                            className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                              isWin
                                ? 'text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50/40 dark:bg-emerald-950/20'
                                : ''
                            }`}
                          >
                            {row.get(c)}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5 text-[11px] text-slate-600 dark:text-slate-400">
                        {winnerTicker ? (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <strong className="font-mono text-slate-900 dark:text-slate-100">
                              {winnerTicker}
                            </strong>
                            {row.whyMatters ? <span>· {row.whyMatters}</span> : null}
                          </span>
                        ) : (
                          <span>{row.whyMatters ?? 'Critério descritivo / empate'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

