import React from 'react';
import { useResearch } from '../context/ResearchContext.tsx';
import { exportAssetToCsv } from '../utils/csvExport.ts';
import { exportAssetPdfReport } from '../utils/pdfReport.ts';
import { ConclusionTab } from './asset/ConclusionTab.tsx';
import { FinancialTab } from './asset/FinancialTab.tsx';
import { OverviewTab } from './asset/OverviewTab.tsx';
import { QualitativeTab } from './asset/QualitativeTab.tsx';
import { ValuationTab } from './asset/ValuationTab.tsx';

const ASSET_TABS: Array<{
  id: 'overview' | 'financial' | 'qualitative' | 'valuation' | 'conclusion';
  label: string;
}> = [
  { id: 'overview', label: '01. Visão Geral' },
  { id: 'financial', label: '02. Análise Financeira' },
  { id: 'qualitative', label: '03. Qualitativa & Moat' },
  { id: 'valuation', label: '04. Valuation' },
  { id: 'conclusion', label: '05. Conclusão & IA' },
];

export function AssetWorkspace() {
  const {
    currentAnalysis,
    assetTab,
    setAssetTab,
    setNavView,
    liveQuotesMap,
    fetchingQuote,
    refreshQuote,
    priceAlertsMap,
    canEditTenant,
    canApproveTenant,
    savePriceAlert,
    deletePriceAlert,
    setInspectedIndicator,
    activeOrg,
    aiSummariesMap,
    setAiSummary,
    analystNotesMap,
    updateAnalystNotes,
    approvalStatusMap,
    updateApprovalStatus,
    valuationOverridesMap,
    changeValuationOverrides,
    resetValuationOverrides,
    saveValuationOverrides,
    macro,
  } = useResearch();

  if (!currentAnalysis) return null;

  const ticker = currentAnalysis.asset.ticker;
  const liveSelic = macro?.selicMetaPct.status === 'live' ? macro.selicMetaPct.value : null;

  return (
    <div className="space-y-6">
      {/* Segmented Sub-Screen Bar */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-fit max-w-full overflow-x-auto">
        {ASSET_TABS.map((tab) => {
          const active = assetTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setAssetTab(tab.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {assetTab === 'overview' && (
        <OverviewTab
          analysis={currentAnalysis}
          liveQuote={liveQuotesMap[ticker] ?? null}
          isFetchingQuote={fetchingQuote}
          priceAlert={priceAlertsMap[ticker]}
          canEditAlert={canEditTenant}
          onSavePriceAlert={savePriceAlert}
          onDeletePriceAlert={deletePriceAlert}
          onRefreshQuote={() => void refreshQuote(ticker)}
          onSelectIndicator={setInspectedIndicator}
          onExportPdf={(type) =>
            exportAssetPdfReport(currentAnalysis, type, {
              orgName: activeOrg?.name,
              aiExecutiveText: aiSummariesMap[ticker],
              analystNotes: analystNotesMap[ticker],
            })
          }
          onExportCsv={() => exportAssetToCsv(currentAnalysis)}
          onNavigateTab={setAssetTab}
          onOpenSimulator={() => setNavView('simulator')}
        />
      )}

      {assetTab === 'financial' && (
        <FinancialTab analysis={currentAnalysis} onSelectIndicator={setInspectedIndicator} />
      )}

      {assetTab === 'qualitative' && (
        <QualitativeTab
          analysis={currentAnalysis}
          analystNotes={analystNotesMap[ticker] ?? ''}
          canEditNotes={canEditTenant}
          onSaveNotes={(notes) => updateAnalystNotes(ticker, notes)}
        />
      )}

      {assetTab === 'valuation' && (
        <ValuationTab
          analysis={currentAnalysis}
          overrides={valuationOverridesMap[ticker] ?? {}}
          liveSelicPct={liveSelic}
          canEdit={canEditTenant}
          onChangeOverrides={(next) => changeValuationOverrides(ticker, next)}
          onResetOverrides={() => resetValuationOverrides(ticker)}
          onSaveOverrides={() => void saveValuationOverrides(ticker)}
        />
      )}

      {assetTab === 'conclusion' && (
        <ConclusionTab
          analysis={currentAnalysis}
          approvalStatus={approvalStatusMap[ticker] ?? 'rascunho'}
          canEdit={canEditTenant}
          canApprove={canApproveTenant}
          aiSummary={aiSummariesMap[ticker] ?? ''}
          onSetAiSummary={(text) => setAiSummary(ticker, text)}
          onUpdateStatus={(status) => updateApprovalStatus(ticker, status)}
        />
      )}
    </div>
  );
}
