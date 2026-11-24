import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellRing,
  Calculator,
  Download,
  FileSpreadsheet,
  GitBranch,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { formatIndicatorValue } from '../../engine/financial/mathUtils.ts';
import { IntegratedAssetAnalysis } from '../../engine/integrated/integratedEngine.ts';
import { buildCrossPillarCausalFlow } from '../../engine/integrated/interpretationEngine.ts';
import { IndicatorDiagnostic } from '../../engine/types.ts';
import {
  isPriceAlertTriggered,
  PriceAlertDirection,
  PriceAlertRecord,
} from '../../firebase.ts';
import { PdfReportType } from '../../utils/pdfReport.ts';
import { ScoreBar, SeverityTag } from '../ScoreBadge.tsx';

export interface LiveQuoteInfo {
  ticker: string;
  price: number | null;
  changePct: number | null;
  marketTime: string | null;
  source: string;
  status: 'live' | 'unavailable';
  error?: string;
}

export function OverviewTab({
  analysis,
  liveQuote,
  isFetchingQuote,
  priceAlert,
  canEditAlert,
  onSavePriceAlert,
  onDeletePriceAlert,
  onRefreshQuote,
  onSelectIndicator,
  onExportPdf,
  onExportCsv,
  onNavigateTab,
  onOpenSimulator,
}: {
  analysis: IntegratedAssetAnalysis;
  liveQuote: LiveQuoteInfo | null;
  isFetchingQuote: boolean;
  priceAlert?: PriceAlertRecord;
  canEditAlert: boolean;
  onSavePriceAlert: (alert: PriceAlertRecord) => Promise<void>;
  onDeletePriceAlert: (ticker: string) => Promise<void>;
  onRefreshQuote: () => void;
  onSelectIndicator: (ind: IndicatorDiagnostic) => void;
  onExportPdf: (type: Exclude<PdfReportType, 'comparativo'>) => void;
  onExportCsv: () => void;
  onNavigateTab: (tab: 'overview' | 'financial' | 'qualitative' | 'valuation' | 'conclusion') => void;
  onOpenSimulator?: () => void;
}) {
  const [targetInput, setTargetInput] = useState<string>(
    priceAlert ? String(priceAlert.targetPrice) : analysis.valuation.reconciledFairValue.toFixed(2)
  );
  const [directionInput, setDirectionInput] = useState<PriceAlertDirection>(
    priceAlert?.direction ?? 'lte'
  );
  const [enabledInput, setEnabledInput] = useState<boolean>(priceAlert?.enabled ?? true);
  const [noteInput, setNoteInput] = useState<string>(priceAlert?.note ?? '');
  const [savingAlert, setSavingAlert] = useState(false);
  const [causalPillarTab, setCausalPillarTab] = useState<'financial' | 'qualitative' | 'valuation'>('financial');
  const causalFlow = buildCrossPillarCausalFlow(analysis);
  const activeCausalPillar =
    causalFlow.pillars.find((p) => p.pillarId === causalPillarTab) ?? causalFlow.pillars[0];

  useEffect(() => {
    setTargetInput(
      priceAlert ? String(priceAlert.targetPrice) : analysis.valuation.reconciledFairValue.toFixed(2)
    );
    setDirectionInput(priceAlert?.direction ?? 'lte');
    setEnabledInput(priceAlert?.enabled ?? true);
    setNoteInput(priceAlert?.note ?? '');
  }, [analysis.asset.ticker, analysis.valuation.reconciledFairValue, priceAlert]);

  const alertTriggered = isPriceAlertTriggered(priceAlert, analysis.valuation.currentPrice);
  const distancePct =
    priceAlert && priceAlert.targetPrice > 0
      ? ((priceAlert.targetPrice - analysis.valuation.currentPrice) /
          analysis.valuation.currentPrice) *
        100
      : null;

  const handleSaveAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(targetInput.replace(',', '.'));
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    setSavingAlert(true);
    try {
      await onSavePriceAlert({
        ticker: analysis.asset.ticker,
        targetPrice: Number(numeric.toFixed(2)),
        direction: directionInput,
        enabled: enabledInput,
        note: noteInput.trim() || undefined,
      });
    } finally {
      setSavingAlert(false);
    }
  };

  const ind = analysis.financial.indicators;
  const keyIds =
    analysis.asset.assetType === 'fii'
      ? ['dividend_yield', 'pvp', 'vacancia_fisica', 'cap_rate_implicito', 'wault', 'liquidez_diaria_fii']
      : analysis.asset.assetType === 'bank'
        ? ['roe', 'roa', 'basileia', 'inadimplencia_90d', 'pl', 'pvp', 'dividend_yield', 'nim']
        : analysis.asset.assetType === 'insurer'
          ? ['roe', 'sinistralidade', 'combined_ratio', 'pl', 'pvp', 'dividend_yield']
          : ['roic', 'roe', 'margem_ebitda', 'divida_liquida_ebitda', 'fcff', 'pl', 'ev_ebitda', 'dividend_yield'];

  const spotlightIndicators = keyIds
    .map((id) => ind[id])
    .filter((item): item is IndicatorDiagnostic => Boolean(item));

  return (
    <div className="space-y-6">
      {/* Triggered Price Alert Banner */}
      {alertTriggered && priceAlert && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 rounded-xl px-4 py-3 text-xs text-emerald-900 dark:text-emerald-200">
          <div className="flex items-center gap-2.5">
            <BellRing className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <strong>Alerta de Preço-Alvo Atingido ({analysis.asset.ticker}):</strong>{' '}
              Cotação atual de{' '}
              <span className="font-mono font-bold tabular-nums">
                R$ {analysis.valuation.currentPrice.toFixed(2)}
              </span>{' '}
              atingiu o patamar configurado (
              <span className="font-mono font-semibold tabular-nums">
                {priceAlert.direction === 'lte' ? '<=' : '>='} R$ {priceAlert.targetPrice.toFixed(2)}
              </span>
              ){priceAlert.note ? ` · ${priceAlert.note}` : ''}.
            </div>
          </div>
          <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
            Gatilho atingido
          </span>
        </div>
      )}

      {/* Top Executive Identity & Price Strip */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
              {analysis.asset.ticker}
            </span>
            <span>·</span>
            <span>{analysis.sectorName}</span>
            <span>·</span>
            <span>{analysis.asset.segment}</span>
            <span>·</span>
            <span>Ref. {analysis.financial.referencePeriod}</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {analysis.asset.name}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 max-w-3xl">
            {analysis.asset.description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 shrink-0">
          <div className="text-right">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Cotação{' '}
              {liveQuote?.status === 'live'
                ? `(${liveQuote.source})`
                : `(${analysis.asset.market.priceSource})`}
            </div>
            <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-slate-100">
              R$ {analysis.valuation.currentPrice.toFixed(2)}
            </div>
            <div className="text-xs text-slate-500 font-mono tabular-nums">
              Justo: R$ {analysis.valuation.reconciledFairValue.toFixed(2)} · MoS{' '}
              <span
                className={
                  analysis.valuation.marginOfSafetyPct >= 0
                    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                    : 'text-rose-600 dark:text-rose-400 font-semibold'
                }
              >
                {analysis.valuation.marginOfSafetyPct.toFixed(1)}%
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onRefreshQuote}
            disabled={isFetchingQuote}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetchingQuote ? 'animate-spin' : ''}`} />
            Atualizar B3
          </button>

          {onOpenSimulator && (
            <button
              type="button"
              onClick={onOpenSimulator}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-700 text-white text-xs font-medium hover:bg-teal-800 cursor-pointer"
            >
              <Calculator className="w-3.5 h-3.5" />
              Simular Compra
            </button>
          )}
        </div>
      </div>

      {liveQuote?.status === 'unavailable' && (
        <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-4 py-2.5">
          Consulta pública B3 indisponível no momento ({liveQuote.error ?? 'sem resposta'}). Mantida cotação de referência de {analysis.asset.market.priceDate}.
        </div>
      )}

      {/* 4 Scores + Coverage */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <ScoreBar
          label="Pilar 1 · Financeiro"
          score={analysis.scores.financial.pillarScore}
          coverage={analysis.scores.financial.dataCoveragePct}
          subtitle={analysis.financial.earningsQuality.classification}
        />
        <ScoreBar
          label="Pilar 2 · Qualitativo"
          score={analysis.scores.qualitative.pillarScore}
          coverage={analysis.scores.qualitative.dataCoveragePct}
          subtitle={`Moat ${analysis.qualitative.moatStrengthOverall.replace(/_/g, ' ')}`}
        />
        <ScoreBar
          label="Pilar 3 · Valuation"
          score={analysis.scores.valuation.pillarScore}
          coverage={analysis.scores.valuation.dataCoveragePct}
          subtitle={`Confiança ${analysis.valuation.confidenceLevel}`}
        />
        <ScoreBar
          label="Nota Geral Integrada"
          score={analysis.scores.overallScore}
          coverage={analysis.scores.overallDataCoveragePct}
          subtitle={`Pesos ${(analysis.scores.weightsUsed.overall.financialWeight * 100).toFixed(0)}/${(analysis.scores.weightsUsed.overall.qualitativeWeight * 100).toFixed(0)}/${(analysis.scores.weightsUsed.overall.valuationWeight * 100).toFixed(0)}`}
        />
      </div>

      {/* Causal Interpretation & Direct Influence Breakdown */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="p-5 space-y-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-start gap-2.5">
            <GitBranch className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Por que esta Nota & Como Cada Pilar Influencia Diretamente a Tese
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                {causalFlow.overallVerdict}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800 text-xs">
          <div className="p-4 space-y-1">
            <div className="font-semibold text-teal-700 dark:text-teal-400">
              1. Pilar Financeiro → Pilar 2 e Valuation
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              {causalFlow.p1ToP2AndP3}
            </p>
          </div>
          <div className="p-4 space-y-1">
            <div className="font-semibold text-sky-700 dark:text-sky-400">
              2. Pilar Qualitativo → Custo de Capital e Crescimento
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              {causalFlow.p2ToP3}
            </p>
          </div>
          <div className="p-4 space-y-1">
            <div className="font-semibold text-amber-700 dark:text-amber-400">
              3. Valuation → Margem de Segurança e Decisão
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              {causalFlow.p3ToDecision}
            </p>
          </div>
        </div>

        {/* Sub-component Why & Direct Impact Explorer */}
        <div className="p-5 space-y-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-lg text-xs">
              {causalFlow.pillars.map((p) => (
                <button
                  key={p.pillarId}
                  type="button"
                  onClick={() => setCausalPillarTab(p.pillarId)}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    causalPillarTab === p.pillarId
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {p.title} ({p.score}/100)
                </button>
              ))}
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Contribuição na Nota Geral: +{activeCausalPillar.pointsContributed} pts · Peso {activeCausalPillar.weightInOverallPct}%
            </span>
          </div>

          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            <strong>Resumo causal do pilar:</strong> {activeCausalPillar.whySummary}{' '}
            {activeCausalPillar.directImpactSummary}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden text-xs">
            {activeCausalPillar.drivers.map((d) => (
              <div
                key={d.label}
                className="bg-white dark:bg-slate-900 p-3.5 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {d.label}{' '}
                    <span className="text-[11px] font-normal text-slate-400">· Peso {d.weight}%</span>
                  </span>
                  <span
                    className={`font-mono tabular-nums text-xs font-semibold ${
                      d.polarity === 'positivo'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : d.polarity === 'negativo'
                          ? 'text-rose-700 dark:text-rose-400'
                          : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {d.status === 'not_applicable'
                      ? 'N/A'
                      : d.score !== null
                        ? `${d.score}/100`
                        : 'Indisp.'}
                  </span>
                </div>
                <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                  <strong>Por quê:</strong> {d.why}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  <strong>Influência direta:</strong> {d.directInfluence}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Price-Target Alert Configuration Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {alertTriggered ? (
              <BellRing className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Bell className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            )}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Alerta de Preço-Alvo ({analysis.asset.ticker})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Defina um gatilho de preço para monitoramento automático no dashboard e na Visão Geral.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {priceAlert ? (
              <span
                className={`font-mono px-2.5 py-1 rounded border font-semibold ${
                  alertTriggered
                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                    : priceAlert.enabled
                      ? 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-400'
                }`}
              >
                {alertTriggered
                  ? 'Patamar Atingido'
                  : priceAlert.enabled
                    ? `Monitorando (${distancePct !== null ? `${distancePct >= 0 ? '+' : ''}${distancePct.toFixed(1)}%` : 'N/D'})`
                    : 'Pausado'}
              </span>
            ) : (
              <span className="text-slate-400">Nenhum alerta configurado</span>
            )}

            <button
              type="button"
              onClick={() => {
                setTargetInput(analysis.valuation.reconciledFairValue.toFixed(2));
                setDirectionInput('lte');
              }}
              className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Usar Valor Justo (R$ {analysis.valuation.reconciledFairValue.toFixed(2)})
            </button>
            <button
              type="button"
              onClick={() => {
                setTargetInput((analysis.valuation.reconciledFairValue * 0.85).toFixed(2));
                setDirectionInput('lte');
              }}
              className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Entrada MoS -15% (R$ {(analysis.valuation.reconciledFairValue * 0.85).toFixed(2)})
            </button>
          </div>
        </div>

        <form onSubmit={handleSaveAlert} className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs items-end">
          <label className="sm:col-span-3 block space-y-1">
            <span className="text-slate-500 font-medium">Condição de Gatilho</span>
            <select
              value={directionInput}
              disabled={!canEditAlert}
              onChange={(e) => setDirectionInput(e.target.value as PriceAlertDirection)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
            >
              <option value="lte">Preço &lt;= Alvo (Compra / Entrada)</option>
              <option value="gte">Preço &gt;= Alvo (Realização / Alvo)</option>
            </select>
          </label>

          <label className="sm:col-span-2 block space-y-1">
            <span className="text-slate-500 font-medium">Preço-Alvo (R$)</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              disabled={!canEditAlert}
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              className="w-full font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
            />
          </label>

          <label className="sm:col-span-3 block space-y-1">
            <span className="text-slate-500 font-medium">Observação (opcional)</span>
            <input
              type="text"
              maxLength={300}
              disabled={!canEditAlert}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Ex.: Aumentar posição com MoS >= 15%"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
            />
          </label>

          <label className="sm:col-span-1 flex items-center gap-1.5 pb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabledInput}
              disabled={!canEditAlert}
              onChange={(e) => setEnabledInput(e.target.checked)}
              className="rounded border-slate-300 text-teal-600"
            />
            <span>Ativo</span>
          </label>

          <div className="sm:col-span-3 flex items-center justify-end gap-2">
            {priceAlert && canEditAlert && (
              <button
                type="button"
                onClick={() => void onDeletePriceAlert(analysis.asset.ticker)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                title="Remover alerta"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remover
              </button>
            )}
            {canEditAlert && (
              <button
                type="submit"
                disabled={savingAlert}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-700 text-white font-medium hover:bg-teal-800 disabled:opacity-50 cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5" />
                {savingAlert ? 'Salvando...' : 'Salvar Alerta'}
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Warning Flags & Exports Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <span className="font-medium text-slate-700 dark:text-slate-300">
            Equação Contábil BP:{' '}
            {analysis.financial.accountingIdentityChecks.every((c) => c.valid)
              ? '100% Verificada (Ativo = Passivo + PL)'
              : 'Divergência identificada'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onExportPdf('resumido')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            PDF Resumido
          </button>
          <button
            type="button"
            onClick={() => onExportPdf('completo')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium hover:opacity-90 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            PDF Completo
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Spotlight Indicators — Single-Elevation Hairline Grid */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Painel Rápido de Indicadores-Chave do Setor
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Clique em qualquer indicador para inspecionar o diagnóstico em 10 pontos e a série histórica.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('financial')}
            className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap cursor-pointer"
          >
            Ver 12 sub-abas financeiras →
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-slate-200 dark:bg-slate-800">
          {spotlightIndicators.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectIndicator(item)}
              className="text-left bg-white dark:bg-slate-900 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
            >
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {item.name}
              </div>
              <div className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">
                {item.status === 'not_applicable'
                  ? 'N/A'
                  : formatIndicatorValue(item.value, item.unit)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between gap-2">
                <span className="truncate">{item.trend.replace(/_/g, ' ')}</span>
                {item.yoyVariationPct !== null && (
                  <span className="font-mono tabular-nums shrink-0">
                    {item.yoyVariationPct >= 0 ? '+' : ''}
                    {item.yoyVariationPct.toFixed(1)}%
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Valuation Quick Snapshot & Active Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-600" />
              Cenários de Valuation & WACC
            </h3>
            <button
              type="button"
              onClick={() => onNavigateTab('valuation')}
              className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
            >
              Simular premissas →
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2.5 text-center">
            {(['conservador', 'base', 'otimista'] as const).map((key) => {
              const sc = analysis.valuation.scenarios[key];
              return (
                <div
                  key={key}
                  className="border border-slate-200 dark:border-slate-800 rounded-lg p-3"
                >
                  <div className="text-xs text-slate-500">{sc.name}</div>
                  <div className="font-mono tabular-nums text-base font-bold mt-1">
                    R$ {sc.fairValuePerShare.toFixed(2)}
                  </div>
                  <div className="font-mono tabular-nums text-[11px] text-slate-500 mt-0.5">
                    Upside {sc.upsidePct >= 0 ? '+' : ''}
                    {sc.upsidePct.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {analysis.structuredConclusion.conclusao}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Alertas Automáticos ({analysis.alerts.length})
            </h3>
            <button
              type="button"
              onClick={() => onNavigateTab('conclusion')}
              className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
            >
              Ver conclusão A–H →
            </button>
          </div>
          {analysis.alerts.length === 0 ? (
            <p className="text-xs text-slate-500">
              Nenhum alerta de deterioração financeira, governança ou premissa agressiva disparado neste ativo.
            </p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {analysis.alerts.map((al) => (
                <div
                  key={al.id}
                  className="border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {al.relatedIndicator}
                    </span>
                    <SeverityTag severity={al.severity} />
                  </div>
                  <p className="text-slate-600 dark:text-slate-400">{al.evidence}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
