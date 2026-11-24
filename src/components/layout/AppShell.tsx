import React, { useState } from 'react';
import {
  BarChart3,
  BellRing,
  Building2,
  Calculator,
  Download,
  GitCompare,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import { NavView, useResearch } from '../../context/ResearchContext.tsx';
import { isPriceAlertTriggered } from '../../firebase.ts';

const NAV_ITEMS: Array<{
  id: NavView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Panorama B3', icon: LayoutDashboard },
  { id: 'asset', label: 'Análise do Ativo', icon: BarChart3 },
  { id: 'compare', label: 'Comparador', icon: GitCompare },
  { id: 'simulator', label: 'Simulador Real', icon: Calculator },
  { id: 'admin', label: 'Administração', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    darkMode,
    toggleDarkMode,
    sidebarOpen,
    setSidebarOpen,
    navView,
    setNavView,
    activeTicker,
    selectTicker,
    allAnalyses,
    currentAnalysis,
    selectedCompareTickers,
    priceAlertsMap,
    triggeredAlerts,
    activeOrg,
    user,
    signInWithGoogle,
    signOutUser,
    toastMsg,
    downloadingZip,
    downloadAppZip,
  } = useResearch();

  const [sidebarSearch, setSidebarSearch] = useState('');

  const filteredSidebarAssets = allAnalyses.filter((a) => {
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      a.asset.ticker.toLowerCase().includes(q) ||
      a.asset.name.toLowerCase().includes(q)
    );
  });

  const breadcrumbLabel = (() => {
    switch (navView) {
      case 'overview':
        return 'Panorama B3 & Screener';
      case 'asset':
        return `${currentAnalysis.asset.ticker} · ${currentAnalysis.asset.name}`;
      case 'compare':
        return `Comparador (${selectedCompareTickers.length} ativos)`;
      case 'simulator':
        return 'Simulador de Compra & Retorno Real';
      case 'admin':
        return 'Administração, Pesos & Exportação';
    }
  })();

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        {/* Mobile drawer backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Fixed 260px Institutional Workspace Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-[260px] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-200 ease-out lg:translate-x-0 lg:static shrink-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="h-14 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={() => {
                setNavView('overview');
                setSidebarOpen(false);
              }}
              className="text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 rounded"
            >
              <span className="font-display font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
                Ápice Research
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Fechar menu"
              className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 flex-1 flex flex-col min-h-0 overflow-y-auto space-y-5">
            {/* Primary Navigation */}
            <nav aria-label="Navegação principal" className="space-y-0.5 text-xs">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = navView === item.id;
                const suffix =
                  item.id === 'compare'
                    ? ` (${selectedCompareTickers.length})`
                    : item.id === 'asset'
                      ? ` · ${currentAnalysis.asset.ticker}`
                      : '';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setNavView(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                      active
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">
                      {item.label}
                      {suffix}
                    </span>
                  </button>
                );
              })}
            </nav>

            {/* Quick Watchlist Jump */}
            <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
              <div className="flex items-center justify-between px-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Cobertura B3</span>
                <span className="font-mono tabular-nums">{allAnalyses.length}</span>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  placeholder="Filtrar ticker..."
                  aria-label="Filtrar ticker na barra lateral"
                  className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="space-y-0.5">
                {filteredSidebarAssets.map((a) => {
                  const alertHit = isPriceAlertTriggered(
                    priceAlertsMap[a.asset.ticker],
                    a.valuation.currentPrice
                  );
                  const isActiveAsset = navView === 'asset' && activeTicker === a.asset.ticker;
                  return (
                    <button
                      key={a.asset.ticker}
                      type="button"
                      onClick={() => selectTicker(a.asset.ticker)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                        isActiveAsset
                          ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <span className="font-mono inline-flex items-center gap-1.5 truncate">
                        <span>{a.asset.ticker}</span>
                        {alertHit && (
                          <BellRing
                            className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0"
                            aria-label="Preço-alvo atingido"
                          />
                        )}
                      </span>
                      <span className="font-mono tabular-nums text-[11px] shrink-0">
                        {a.scores.overallScore}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sidebar Workspace Controls Footer */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs shrink-0">
            {activeOrg && (
              <div className="flex items-center gap-2 px-2 py-1 text-slate-600 dark:text-slate-300">
                <Building2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span className="truncate">{activeOrg.name}</span>
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleDarkMode}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
              >
                {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                <span>{darkMode ? 'Tema Claro' : 'Tema Escuro'}</span>
              </button>

              <button
                type="button"
                onClick={() => void downloadAppZip()}
                disabled={downloadingZip}
                title="Baixar código-fonte em .zip"
                className="inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>.zip</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Viewport */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 3-Zone Top Header Bar */}
          <header className="sticky top-0 z-20 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 flex items-center justify-between gap-6">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Abrir navegação"
                className="lg:hidden p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                <Menu className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 text-xs min-w-0">
                <span className="hidden sm:inline text-slate-400 dark:text-slate-500 whitespace-nowrap">
                  Ápice Research
                </span>
                <span className="hidden sm:inline text-slate-300 dark:text-slate-700" aria-hidden="true">
                  /
                </span>
                <h1 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                  {breadcrumbLabel}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 text-xs">
              {triggeredAlerts.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (navView !== 'overview') {
                      setNavView('overview');
                    } else {
                      selectTicker(triggeredAlerts[0].asset.ticker);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <BellRing className="w-3.5 h-3.5" />
                  <span className="font-mono tabular-nums">
                    {triggeredAlerts.length}{' '}
                    {triggeredAlerts.length === 1 ? 'alerta atingido' : 'alertas atingidos'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => void downloadAppZip()}
                disabled={downloadingZip}
                title="Baixar código-fonte completo em arquivo .zip"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-teal-300 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200 font-medium hover:border-teal-500 disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{downloadingZip ? 'Empacotando...' : 'Baixar App (.zip)'}</span>
              </button>

              {user ? (
                <button
                  type="button"
                  onClick={() => void signOutUser()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium hover:opacity-90 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Entrar com Google</span>
                </button>
              )}
            </div>
          </header>

          {toastMsg && (
            <div
              role="status"
              className="mx-4 lg:mx-6 mt-3 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium"
            >
              {toastMsg}
            </div>
          )}

          <main className="flex-1 p-4 lg:p-6 max-w-7xl w-full mx-auto">
            <motion.div
              key={`${navView}-${navView === 'asset' ? currentAnalysis.asset.ticker : 'view'}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              {children}
            </motion.div>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
