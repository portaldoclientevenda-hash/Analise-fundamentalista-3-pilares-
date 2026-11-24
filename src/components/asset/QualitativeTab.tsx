import React, { useState } from 'react';
import { Save } from 'lucide-react';
import { IntegratedAssetAnalysis } from '../../engine/integrated/integratedEngine.ts';

type QualSubTab =
  | 'modelo_negocio'
  | 'moat'
  | 'gestao'
  | 'alocacao_capital'
  | 'governanca'
  | 'estrutura_acionaria'
  | 'mercado'
  | 'concorrencia_porter'
  | 'perspectivas'
  | 'riscos'
  | 'esg'
  | 'swot';

const SUB_TABS: Array<{ id: QualSubTab; label: string }> = [
  { id: 'modelo_negocio', label: 'Modelo de Negócio' },
  { id: 'moat', label: 'Moat (7 Dimensões)' },
  { id: 'gestao', label: 'Gestão' },
  { id: 'alocacao_capital', label: 'Alocação de Capital' },
  { id: 'governanca', label: 'Governança' },
  { id: 'estrutura_acionaria', label: 'Estrutura Acionária' },
  { id: 'mercado', label: 'Mercado & Produtos' },
  { id: 'concorrencia_porter', label: 'Porter (5 Forças)' },
  { id: 'perspectivas', label: 'Perspectivas' },
  { id: 'riscos', label: '10 Riscos' },
  { id: 'esg', label: 'ESG Auditável' },
  { id: 'swot', label: 'SWOT + Macro' },
];

export function QualitativeTab({
  analysis,
  analystNotes,
  canEditNotes,
  onSaveNotes,
}: {
  analysis: IntegratedAssetAnalysis;
  analystNotes: string;
  canEditNotes: boolean;
  onSaveNotes: (notes: string) => void;
}) {
  const [subTab, setSubTab] = useState<QualSubTab>('modelo_negocio');
  const [draftNotes, setDraftNotes] = useState(analystNotes);
  const q = analysis.asset.qualitative;

  return (
    <div className="space-y-5">
      {/* Qualitative Sub-scores Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
        {analysis.qualitative.subScores.map((s) => (
          <div
            key={s.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3"
          >
            <div className="text-[11px] text-slate-500 truncate">{s.label}</div>
            <div className="font-mono tabular-nums text-lg font-bold mt-1">
              {s.score ?? 'N/D'}
              <span className="text-xs font-normal text-slate-400">/100</span>
            </div>
          </div>
        ))}
      </div>

      {/* 12 Sub-tabs */}
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

      {subTab === 'modelo_negocio' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 text-xs">
            <h3 className="text-sm font-semibold">Descrição Objetiva do Modelo de Negócio</h3>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              {q.businessModel.objectiveDescription}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                <div className="font-semibold">O que vende & Monetização</div>
                <p className="text-slate-600 dark:text-slate-300 mt-1">
                  {q.businessModel.whatItSells} — {q.businessModel.monetization}
                </p>
              </div>
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                <div className="font-semibold">Clientes & Cadeia / Distribuição</div>
                <p className="text-slate-600 dark:text-slate-300 mt-1">
                  {q.businessModel.clients} · {q.businessModel.supplyChainDistribution}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(q.businessModel.diagnosticQuestions).map(([key, val]) => (
              <div
                key={key}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                  <span className="font-mono font-bold text-teal-700 dark:text-teal-400">
                    {val.answer}
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 mt-1">{val.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'moat' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {q.moats.map((m) => (
            <div
              key={m.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{m.label}</span>
                <span className="font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                  {m.intensity.replace(/_/g, ' ')}
                </span>
              </div>
              <div>
                <div className="font-medium text-slate-500">Evidências Documentadas:</div>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mt-1 space-y-0.5">
                  {m.evidences.map((ev, i) => (
                    <li key={i}>{ev}</li>
                  ))}
                </ul>
              </div>
              {m.vulnerabilities.length > 0 && (
                <div className="text-amber-700 dark:text-amber-400">
                  Vulnerabilidades: {m.vulnerabilities.join('; ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {subTab === 'gestao' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Gestão Executiva & Consistência</h3>
            <span className="font-mono px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700">
              Veredito: {q.management.valueCreationVerdict.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-slate-600 dark:text-slate-300">{q.management.executivesSummary}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="font-semibold">Track Record & Guidance</div>
              <p className="text-slate-600 dark:text-slate-300 mt-1">
                {q.management.tenureAndTrackRecord} · {q.management.guidanceExecution}
              </p>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="font-semibold">Discurso vs Resultado</div>
              <p className="text-slate-600 dark:text-slate-300 mt-1">
                {q.management.consistencySpeechVsResults}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {Object.entries(q.management.keyDecisions).map(([k, v]) => (
              <div key={k} className="border border-slate-200 dark:border-slate-800 rounded-lg p-2.5">
                <div className="font-semibold capitalize">{k}</div>
                <p className="text-slate-600 dark:text-slate-300 mt-0.5">{v}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'alocacao_capital' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-xs space-y-3">
          <h3 className="text-sm font-semibold">
            Alocação de Capital (Integrada ao ROIC vs WACC do Pilar 1)
          </h3>
          <p className="text-slate-600 dark:text-slate-300 font-medium">
            {q.capitalAllocation.incrementalRoicVsWaccNote}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="font-semibold">Reinvestimento & P&D</div>
              <p className="text-slate-600 dark:text-slate-300 mt-1">
                {q.capitalAllocation.reinvestmentQuality} · {q.capitalAllocation.rdAndInnovation}
              </p>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="font-semibold">M&A, Dívida & Proventos</div>
              <p className="text-slate-600 dark:text-slate-300 mt-1">
                {q.capitalAllocation.maTrackRecord} · {q.capitalAllocation.dividendAndBuybackDiscipline}
              </p>
            </div>
          </div>
        </div>
      )}

      {subTab === 'governanca' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-xs space-y-3">
          <h3 className="text-sm font-semibold">Governança Corporativa & Proteção aos Minoritários</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="text-slate-500">Segmento Listagem</div>
              <div className="font-semibold mt-1">{q.governance.listingSegment}</div>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="text-slate-500">Independência Conselho</div>
              <div className="font-mono font-bold mt-1">
                {q.governance.boardIndependencePct ?? 'N/D'}%
              </div>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="text-slate-500">Tag Along</div>
              <div className="font-mono font-bold mt-1">{q.governance.tagAlongPct ?? 'N/D'}%</div>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="text-slate-500">Transparência</div>
              <div className="font-mono font-bold mt-1">
                {q.governance.transparencyRating ?? 'N/D'}/100
              </div>
            </div>
          </div>
          <p className="text-slate-600 dark:text-slate-300">
            Auditoria/Comitê: {q.governance.auditCommitteeAndAuditor} · Partes Relacionadas:{' '}
            {q.governance.relatedPartyTransactions} · Remuneração: {q.governance.compensationPolicy}
          </p>
        </div>
      )}

      {subTab === 'estrutura_acionaria' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-xs space-y-3">
          <h3 className="text-sm font-semibold">Composição Acionária & Histórico de Diluição</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="text-slate-500">Controladores</div>
              <div className="font-mono font-bold mt-1">{q.ownershipStructure.controllersPct ?? 'N/D'}%</div>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="text-slate-500">Institucionais</div>
              <div className="font-mono font-bold mt-1">{q.ownershipStructure.institutionalPct ?? 'N/D'}%</div>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="text-slate-500">Varejo / Outros</div>
              <div className="font-mono font-bold mt-1">{q.ownershipStructure.retailPct ?? 'N/D'}%</div>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="text-slate-500">Classes de Ações</div>
              <div className="font-semibold mt-1">{q.ownershipStructure.shareClasses}</div>
            </div>
          </div>
          <p className="text-slate-600 dark:text-slate-300">
            Diluição: {q.ownershipStructure.dilutionHistoryNote} · Recompras:{' '}
            {q.ownershipStructure.buybackHistoryNote}
          </p>
        </div>
      )}

      {subTab === 'mercado' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-xs space-y-3">
          <h3 className="text-sm font-semibold">Qualidade de Produtos/Serviços & Poder de Preço</h3>
          <p className="text-slate-600 dark:text-slate-300">
            Diferenciação: {q.productQuality.differentiation} · Poder de Precificação:{' '}
            <strong>{q.productQuality.pricingPower}</strong> · Retenção:{' '}
            {q.productQuality.retentionAndLoyalty}
          </p>
          <p className="text-slate-600 dark:text-slate-300">
            Mercado endereçável: {q.marketAndCompetition.marketSizeAndGrowth} · Participação:{' '}
            {q.marketAndCompetition.marketShareNote}
          </p>
          <p className="text-slate-500">
            Concorrentes diretos: {q.marketAndCompetition.directCompetitors.join(', ')}
          </p>
        </div>
      )}

      {subTab === 'concorrencia_porter' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(q.marketAndCompetition.porterFiveForces).map(([force, data]) => (
            <div
              key={force}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold capitalize">{force.replace(/([A-Z])/g, ' $1')}</span>
                <span className="font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                  {data.level}
                </span>
              </div>
              <p className="text-slate-600 dark:text-slate-300">{data.analysis}</p>
            </div>
          ))}
        </div>
      )}

      {subTab === 'perspectivas' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 text-xs space-y-3">
          <h3 className="text-sm font-semibold">Vetores Reais vs Expectativas Especulativas</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border border-emerald-200 dark:border-emerald-900 rounded-lg p-3">
              <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                Drivers Fundamentados
              </div>
              <ul className="list-disc list-inside mt-1 space-y-1 text-slate-600 dark:text-slate-300">
                {q.growthProspects.realDrivers.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
            <div className="border border-amber-200 dark:border-amber-900 rounded-lg p-3">
              <div className="font-semibold text-amber-700 dark:text-amber-400">
                Opcionalidades / Expectativas Especulativas
              </div>
              <ul className="list-disc list-inside mt-1 space-y-1 text-slate-600 dark:text-slate-300">
                {q.growthProspects.speculativeExpectations.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-slate-600 dark:text-slate-300">
            Expansão: {q.growthProspects.geographicAndProductExpansion} · Digitalização:{' '}
            {q.growthProspects.digitalizationAndEfficiency}
          </p>
        </div>
      )}

      {subTab === 'riscos' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {q.risks.map((r) => (
            <div
              key={r.category}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{r.label}</span>
                <span className="font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                  {r.severity}
                </span>
              </div>
              <p className="text-slate-600 dark:text-slate-300">{r.description}</p>
              <p className="text-slate-500">Evidência: {r.evidence}</p>
            </div>
          ))}
        </div>
      )}

      {subTab === 'esg' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
            <h4 className="font-semibold text-sm">Divulgado pela Companhia (Relatórios Oficiais)</h4>
            <p><strong>Ambiental (E):</strong> {q.esg.companyDisclosed.environmental}</p>
            <p><strong>Social (S):</strong> {q.esg.companyDisclosed.social}</p>
            <p><strong>Governança (G):</strong> {q.esg.companyDisclosed.governance}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
            <h4 className="font-semibold text-sm">Avaliação Independente & Controvérsias</h4>
            <p>{q.esg.independentAssessment.summary}</p>
            <p className="text-slate-500">
              Critérios: {q.esg.independentAssessment.criteriaUsed.join(', ')}
            </p>
            <p className="text-amber-700 dark:text-amber-400">
              Lacunas/Controvérsias: {q.esg.independentAssessment.controversiesOrGaps}
            </p>
          </div>
        </div>
      )}

      {subTab === 'swot' && (
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {q.swot.map((item) => (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold uppercase text-teal-700 dark:text-teal-400">
                    {item.category}
                  </span>
                  <span className="font-mono text-slate-500">
                    Impacto {item.impact} · Prob. {item.probability} · {item.horizon}
                  </span>
                </div>
                <p className="font-medium text-slate-800 dark:text-slate-200">{item.description}</p>
                <p className="text-slate-500">{item.evidence}</p>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
            <h4 className="font-semibold text-sm">
              Sensibilidade Macroeconômica ({q.macroSensitivity.classification.join(' · ')})
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {q.macroSensitivity.factors.map((f) => (
                <div key={f.factor} className="border border-slate-200 dark:border-slate-800 rounded-lg p-2.5">
                  <div className="font-semibold">
                    {f.factor} · {f.sensitivity} ({f.intensity})
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 mt-0.5">{f.mechanism}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Persistent Analyst Notes per Organization */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold">Notas Qualitativas do Analista (Organização)</h4>
            <p className="text-xs text-slate-500">
              Registre evidências de teleconferências, fatos relevantes ou pontos de atenção salvos no tenant ativo.
            </p>
          </div>
          {canEditNotes && (
            <button
              type="button"
              onClick={() => onSaveNotes(draftNotes)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 text-white text-xs font-medium hover:bg-teal-800 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              Salvar Notas
            </button>
          )}
        </div>
        <textarea
          value={draftNotes}
          onChange={(e) => setDraftNotes(e.target.value)}
          disabled={!canEditNotes}
          rows={3}
          placeholder="Observações qualitativas e pontos de diligência da tese..."
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 text-xs focus:outline-none focus:ring-2 focus:ring-teal-600"
        />
      </div>
    </div>
  );
}
