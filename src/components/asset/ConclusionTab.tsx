import React, { useState } from 'react';
import { Bot, CheckCircle2, GitBranch, Send, ShieldAlert, Sparkles } from 'lucide-react';
import { IntegratedAssetAnalysis } from '../../engine/integrated/integratedEngine.ts';
import { buildCrossPillarCausalFlow } from '../../engine/integrated/interpretationEngine.ts';
import { SeverityTag } from '../ScoreBadge.tsx';

export function ConclusionTab({
  analysis,
  approvalStatus,
  canEdit,
  canApprove,
  aiSummary,
  onSetAiSummary,
  onUpdateStatus,
}: {
  analysis: IntegratedAssetAnalysis;
  approvalStatus: 'rascunho' | 'revisado' | 'aprovado';
  canEdit: boolean;
  canApprove: boolean;
  aiSummary: string;
  onSetAiSummary: (text: string) => void;
  onUpdateStatus: (status: 'rascunho' | 'revisado' | 'aprovado') => void;
}) {
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [qaHistory, setQaHistory] = useState<Array<{ q: string; a: string }>>([]);

  const buildDeterministicContext = () => ({
    ticker: analysis.asset.ticker,
    nome: analysis.asset.name,
    setor: analysis.sectorName,
    referencia: analysis.financial.referencePeriod,
    cotacao: analysis.valuation.currentPrice,
    valorJustoReconciliado: analysis.valuation.reconciledFairValue,
    margemSegurancaPct: analysis.valuation.marginOfSafetyPct,
    scores: {
      financeiro: analysis.scores.financial.pillarScore,
      qualitativo: analysis.scores.qualitative.pillarScore,
      valuation: analysis.scores.valuation.pillarScore,
      geral: analysis.scores.overallScore,
      coberturaDadosPct: analysis.scores.overallDataCoveragePct,
    },
    indicadoresChave: {
      roic: analysis.financial.indicators.roic?.value ?? null,
      roe: analysis.financial.indicators.roe?.value ?? null,
      margemEbitda: analysis.financial.indicators.margem_ebitda?.value ?? null,
      dividaLiquidaEbitda: analysis.financial.indicators.divida_liquida_ebitda?.value ?? null,
      pl: analysis.financial.indicators.pl?.value ?? null,
      pvp: analysis.financial.indicators.pvp?.value ?? null,
      dividendYield: analysis.financial.indicators.dividend_yield?.value ?? null,
      waccPct: analysis.valuation.waccPct,
      kePct: analysis.valuation.kePct,
    },
    qualidadeLucros: {
      classificacao: analysis.financial.earningsQuality.classification,
      fcoSobreLl: analysis.financial.earningsQuality.fcoToNetIncomeRatio,
      beneishCalculavel: analysis.financial.earningsQuality.beneishMScore.calculable,
      beneishScore: analysis.financial.earningsQuality.beneishMScore.score,
    },
    moatGeral: analysis.qualitative.moatStrengthOverall,
    alertas: analysis.alerts.map((a) => `${a.severity}: ${a.relatedIndicator} (${a.evidence})`),
    conclusaoDeterministicaAH: analysis.structuredConclusion,
  });

  const handleGenerateAi = async () => {
    setLoadingAi(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: buildDeterministicContext() }),
      });
      const json = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      onSetAiSummary(json.text ?? '');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Falha ao consultar assistente Gemini.');
    } finally {
      setLoadingAi(false);
    }
  };

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setLoadingAi(true);
    setAiError(null);
    const currentQ = question.trim();
    setQuestion('');
    try {
      const res = await fetch('/api/ai/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: currentQ, context: buildDeterministicContext() }),
      });
      const json = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setQaHistory((prev) => [...prev, { q: currentQ, a: json.text ?? '' }]);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Falha no Q&A via servidor.');
    } finally {
      setLoadingAi(false);
    }
  };

  const ah = analysis.structuredConclusion;
  const ahBlocks = [
    { key: 'A) Fato observado', text: ah.fatoObservado },
    { key: 'B) Evidência', text: ah.evidencia },
    { key: 'C) Interpretação', text: ah.interpretacao },
    { key: 'D) Contexto', text: ah.contexto },
    { key: 'E) Impacto', text: ah.impacto },
    { key: 'F) Risco', text: ah.risco },
    { key: 'G) Perspectiva', text: ah.perspectiva },
    { key: 'H) Conclusão', text: ah.conclusao },
  ];

  return (
    <div className="space-y-6">
      {/* Workflow Status Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <CheckCircle2 className="w-4 h-4 text-teal-600" />
          <span>
            Status da Tese no Comitê:{' '}
            <strong className="uppercase font-mono">{approvalStatus}</strong>
          </span>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 text-xs">
            {(['rascunho', 'revisado', 'aprovado'] as const).map((st) => (
              <button
                key={st}
                type="button"
                disabled={st === 'aprovado' && !canApprove}
                onClick={() => onUpdateStatus(st)}
                className={`px-3 py-1.5 rounded-lg border font-medium capitalize cursor-pointer disabled:opacity-40 ${
                  approvalStatus === st
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-transparent'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cross-Pillar Causal Influence Summary */}
      {(() => {
        const causal = buildCrossPillarCausalFlow(analysis);
        return (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 text-xs">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-teal-600" />
              Cadeia de Causa e Influência Direta entre os 3 Pilares
            </h3>
            <p className="text-slate-700 dark:text-slate-200 font-medium">{causal.overallVerdict}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                <div className="font-semibold text-teal-700 dark:text-teal-400">
                  Pilar 1 → Pilar 2 & 3
                </div>
                <p className="text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  {causal.p1ToP2AndP3}
                </p>
              </div>
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                <div className="font-semibold text-sky-700 dark:text-sky-400">
                  Pilar 2 → Custo de Capital (Valuation)
                </div>
                <p className="text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  {causal.p2ToP3}
                </p>
              </div>
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                <div className="font-semibold text-amber-700 dark:text-amber-400">
                  Pilar 3 → Margem de Segurança
                </div>
                <p className="text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  {causal.p3ToDecision}
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* A-H Integrated Diagnosis */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold">
          Conclusão Integrada dos 3 Pilares (Padrão Analítico A–H)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {ahBlocks.map((b) => (
            <div
              key={b.key}
              className="border border-slate-200 dark:border-slate-800 rounded-lg p-3.5"
            >
              <div className="font-semibold text-teal-700 dark:text-teal-400">{b.key}</div>
              <p className="text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{b.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Strengths / Weaknesses & Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
          <h4 className="font-semibold text-emerald-700 dark:text-emerald-400">
            Principais Pontos Fortes Integrados
          </h4>
          <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-300">
            {analysis.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
          <h4 className="font-semibold text-rose-700 dark:text-rose-400">
            Fragilidades & Pontos de Diligência
          </h4>
          <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-300">
            {analysis.weaknesses.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Alerts Full List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-500" />
          Motor de Riscos e Deterioração ({analysis.alerts.length} alerta(s))
        </h3>
        <div className="space-y-2.5">
          {analysis.alerts.map((al) => (
            <div
              key={al.id}
              className="border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-xs space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  {al.relatedIndicator} · Pilar {al.pillar} ({al.period})
                </span>
                <SeverityTag severity={al.severity} />
              </div>
              <p className="text-slate-700 dark:text-slate-200">{al.evidence}</p>
              <p className="text-slate-500">
                Impacto: {al.potentialImpact} · Recomendação: {al.investigationRecommendation}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Server-Side Gemini AI Layer */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Bot className="w-5 h-5 text-teal-600" />
            <div>
              <h3 className="text-sm font-semibold">
                Camada Interpretativa IA (Somente sobre Cálculos Determinísticos)
              </h3>
              <p className="text-xs text-slate-500">
                Execução server-side com citação de fontes, separação fato vs estimativa e zero alteração numérica.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleGenerateAi}
            disabled={loadingAi}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-700 text-white text-xs font-medium hover:bg-teal-800 disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {loadingAi ? 'Processando...' : 'Gerar Síntese Executiva IA'}
          </button>
        </div>

        {aiError && (
          <div className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg p-3">
            {aiError}
          </div>
        )}

        {aiSummary && (
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-50 dark:bg-slate-950/60">
            {aiSummary}
          </div>
        )}

        <form onSubmit={handleAskQuestion} className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={`Pergunte sobre ${analysis.asset.ticker} (ex.: Quais são os riscos no fluxo de caixa e no ROIC vs WACC?)`}
            className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
          <button
            type="submit"
            disabled={loadingAi || !question.trim()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            Perguntar
          </button>
        </form>

        {qaHistory.length > 0 && (
          <div className="space-y-2.5 pt-2">
            {qaHistory.map((item, idx) => (
              <div
                key={idx}
                className="border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-xs space-y-1.5"
              >
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  Pergunta: {item.q}
                </div>
                <div className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {item.a}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
