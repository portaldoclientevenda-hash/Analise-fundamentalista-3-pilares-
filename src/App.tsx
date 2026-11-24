import React from 'react';
import { AdminWorkspace } from './components/AdminWorkspace.tsx';
import { AssetWorkspace } from './components/AssetWorkspace.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { IndicatorModal } from './components/IndicatorModal.tsx';
import { AppShell } from './components/layout/AppShell.tsx';
import { MarketOverview } from './components/MarketOverview.tsx';
import { PeerComparator } from './components/PeerComparator.tsx';
import { ReturnSimulator } from './components/ReturnSimulator.tsx';
import { ResearchProvider, useResearch } from './context/ResearchContext.tsx';

function WorkspaceViews() {
  const {
    navView,
    allAnalyses,
    macro,
    loadingMacro,
    refreshMacro,
    selectTicker,
    selectedCompareTickers,
    toggleCompareTicker,
    importCustomAsset,
    priceAlertsMap,
    canEditTenant,
    fetchingQuote,
    verifyAlertQuotes,
    savePriceAlert,
    deletePriceAlert,
    activeTicker,
    weights,
    setWeights,
    saveWeightsPolicy,
    orgs,
    activeOrg,
    setActiveOrgId,
    createOrg,
    auditLogs,
    user,
    downloadAppZip,
    downloadingZip,
    inspectedIndicator,
    setInspectedIndicator,
  } = useResearch();

  return (
    <>
      <AppShell>
        {navView === 'overview' && (
          <MarketOverview
            analyses={allAnalyses}
            macro={macro}
            isLoadingMacro={loadingMacro}
            onRefreshMacro={() => void refreshMacro()}
            onSelectTicker={selectTicker}
            selectedCompareTickers={selectedCompareTickers}
            onToggleCompareTicker={toggleCompareTicker}
            priceAlertsMap={priceAlertsMap}
            canEditAlerts={canEditTenant}
            checkingAlerts={fetchingQuote}
            onVerifyAlertQuotes={verifyAlertQuotes}
            onSavePriceAlert={savePriceAlert}
            onDeletePriceAlert={deletePriceAlert}
            onImportAsset={importCustomAsset}
          />
        )}

        {navView === 'asset' && <AssetWorkspace />}

        {navView === 'compare' && (
          <PeerComparator
            allAnalyses={allAnalyses}
            selectedTickers={selectedCompareTickers}
            onToggleTicker={toggleCompareTicker}
            orgName={activeOrg?.name ?? 'Escritório Institucional'}
          />
        )}

        {navView === 'simulator' && (
          <ReturnSimulator analyses={allAnalyses} initialTicker={activeTicker} macro={macro} />
        )}

        {navView === 'admin' && (
          <AdminWorkspace
            weights={weights}
            onChangeWeights={setWeights}
            onSaveWeights={saveWeightsPolicy}
            orgs={orgs}
            activeOrg={activeOrg}
            onSwitchOrg={setActiveOrgId}
            onCreateOrg={createOrg}
            auditLogs={auditLogs}
            isAuthenticated={Boolean(user)}
            onDownloadAppZip={() => void downloadAppZip()}
            downloadingZip={downloadingZip}
          />
        )}
      </AppShell>

      <IndicatorModal
        indicator={inspectedIndicator}
        onClose={() => setInspectedIndicator(null)}
      />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ResearchProvider>
        <WorkspaceViews />
      </ResearchProvider>
    </ErrorBoundary>
  );
}
