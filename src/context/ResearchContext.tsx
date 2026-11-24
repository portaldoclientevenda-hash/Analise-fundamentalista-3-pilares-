import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { User } from 'firebase/auth';
import { B3_ASSETS } from '../data/b3Assets.ts';
import {
  DEFAULT_WEIGHTS_CONFIG,
  IntegratedAssetAnalysis,
  runIntegratedAnalysis,
} from '../engine/integrated/integratedEngine.ts';
import {
  AssetRawData,
  IndicatorDiagnostic,
  PillarWeightsConfig,
  ValuationAssumptions,
} from '../engine/types.ts';
import {
  appendOrgAuditLog,
  bootstrapUserAndOrgs,
  createNewOrganization,
  deleteOrgPriceAlert,
  FirestoreAuditEntry,
  isPriceAlertTriggered,
  loadOrgAnalyses,
  loadOrgAuditLogs,
  loadOrgPriceAlerts,
  loadOrgWeights,
  loginWithGoogle,
  logoutUser,
  OrganizationRecord,
  PriceAlertRecord,
  saveOrgAssetAnalysis,
  saveOrgPriceAlert,
  saveOrgWeights,
  subscribeAuth,
  WorkspaceAnalysisRecord,
} from '../firebase.ts';
import type { LiveQuoteInfo } from '../components/asset/OverviewTab.tsx';
import type { MacroSnapshotData } from '../components/MarketOverview.tsx';

export type NavView = 'overview' | 'asset' | 'compare' | 'simulator' | 'admin';
export type AssetScreenTab = 'overview' | 'financial' | 'qualitative' | 'valuation' | 'conclusion';

interface ResearchContextValue {
  darkMode: boolean;
  toggleDarkMode: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  navView: NavView;
  setNavView: (view: NavView) => void;
  assetTab: AssetScreenTab;
  setAssetTab: (tab: AssetScreenTab) => void;

  activeTicker: string;
  selectTicker: (ticker: string) => void;
  allAnalyses: IntegratedAssetAnalysis[];
  currentAnalysis: IntegratedAssetAnalysis;

  selectedCompareTickers: string[];
  toggleCompareTicker: (ticker: string) => void;

  weights: PillarWeightsConfig;
  setWeights: React.Dispatch<React.SetStateAction<PillarWeightsConfig>>;
  saveWeightsPolicy: () => Promise<void>;

  valuationOverridesMap: Record<string, Partial<ValuationAssumptions>>;
  changeValuationOverrides: (ticker: string, next: Partial<ValuationAssumptions>) => void;
  resetValuationOverrides: (ticker: string) => void;
  saveValuationOverrides: (ticker: string) => Promise<void>;

  analystNotesMap: Record<string, string>;
  updateAnalystNotes: (ticker: string, notes: string) => void;
  approvalStatusMap: Record<string, 'rascunho' | 'revisado' | 'aprovado'>;
  updateApprovalStatus: (ticker: string, status: 'rascunho' | 'revisado' | 'aprovado') => void;
  aiSummariesMap: Record<string, string>;
  setAiSummary: (ticker: string, text: string) => void;

  priceAlertsMap: Record<string, PriceAlertRecord>;
  triggeredAlerts: IntegratedAssetAnalysis[];
  savePriceAlert: (alert: PriceAlertRecord) => Promise<void>;
  deletePriceAlert: (ticker: string) => Promise<void>;
  verifyAlertQuotes: () => Promise<void>;

  macro: MacroSnapshotData | null;
  loadingMacro: boolean;
  refreshMacro: () => Promise<void>;
  liveQuotesMap: Record<string, LiveQuoteInfo>;
  fetchingQuote: boolean;
  refreshQuote: (ticker: string) => Promise<void>;

  inspectedIndicator: IndicatorDiagnostic | null;
  setInspectedIndicator: (ind: IndicatorDiagnostic | null) => void;

  user: User | null;
  orgs: OrganizationRecord[];
  activeOrgId: string | null;
  setActiveOrgId: (orgId: string) => void;
  activeOrg: OrganizationRecord | null;
  auditLogs: FirestoreAuditEntry[];
  canEditTenant: boolean;
  canApproveTenant: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  createOrg: (name: string, cnpj?: string) => Promise<void>;
  importCustomAsset: (asset: AssetRawData) => Promise<void>;

  toastMsg: string | null;
  showToast: (msg: string) => void;
  downloadingZip: boolean;
  downloadAppZip: () => Promise<void>;
}

const ResearchContext = createContext<ResearchContextValue | null>(null);

const LOCAL_ALERTS_KEY = 'apice_price_alerts_v1';
const LOCAL_THEME_KEY = 'apice_theme_v1';

function readStoredAlerts(): Record<string, PriceAlertRecord> {
  try {
    const raw = localStorage.getItem(LOCAL_ALERTS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, PriceAlertRecord>) : {};
  } catch {
    return {};
  }
}

export function ResearchProvider({ children }: { children: React.ReactNode }) {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LOCAL_THEME_KEY) === 'dark';
    } catch {
      return false;
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navView, setNavView] = useState<NavView>('overview');
  const [assetTab, setAssetTab] = useState<AssetScreenTab>('overview');

  const [customAssets, setCustomAssets] = useState<AssetRawData[]>([]);
  const [activeTicker, setActiveTicker] = useState<string>('WEGE3');
  const [selectedCompareTickers, setSelectedCompareTickers] = useState<string[]>(['WEGE3', 'EGIE3']);
  const [weights, setWeights] = useState<PillarWeightsConfig>(DEFAULT_WEIGHTS_CONFIG);
  const [valuationOverridesMap, setValuationOverridesMap] = useState<
    Record<string, Partial<ValuationAssumptions>>
  >({});
  const [analystNotesMap, setAnalystNotesMap] = useState<Record<string, string>>({});
  const [approvalStatusMap, setApprovalStatusMap] = useState<
    Record<string, 'rascunho' | 'revisado' | 'aprovado'>
  >({});
  const [aiSummariesMap, setAiSummariesMap] = useState<Record<string, string>>({});
  const [priceAlertsMap, setPriceAlertsMap] = useState<Record<string, PriceAlertRecord>>(readStoredAlerts);

  const [macro, setMacro] = useState<MacroSnapshotData | null>(null);
  const [loadingMacro, setLoadingMacro] = useState(false);
  const [liveQuotesMap, setLiveQuotesMap] = useState<Record<string, LiveQuoteInfo>>({});
  const [fetchingQuote, setFetchingQuote] = useState(false);
  const [inspectedIndicator, setInspectedIndicator] = useState<IndicatorDiagnostic | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [orgs, setOrgs] = useState<OrganizationRecord[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<FirestoreAuditEntry[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [downloadingZip, setDownloadingZip] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 4200);
  }, []);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(LOCAL_THEME_KEY, next ? 'dark' : 'light');
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const refreshMacro = useCallback(async () => {
    setLoadingMacro(true);
    try {
      const res = await fetch('/api/collector/macro');
      if (res.ok) {
        const json = (await res.json()) as MacroSnapshotData;
        setMacro(json);
      }
    } catch {
      // macro panel explicitly handles null/unavailable states
    } finally {
      setLoadingMacro(false);
    }
  }, []);

  useEffect(() => {
    void refreshMacro();
  }, [refreshMacro]);

  useEffect(() => {
    const unsub = subscribeAuth(async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setOrgs([]);
        setActiveOrgId(null);
        setAuditLogs([]);
        setPriceAlertsMap(readStoredAlerts());
        return;
      }
      try {
        const userOrgs = await bootstrapUserAndOrgs(currentUser);
        setOrgs(userOrgs);
        if (userOrgs.length > 0) {
          setActiveOrgId(userOrgs[0].id);
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Erro ao carregar organização.');
      }
    });
    return () => unsub();
  }, [showToast]);

  useEffect(() => {
    if (!user || !activeOrgId) return;
    (async () => {
      try {
        const [orgAnalyses, orgWeights, logs, orgAlerts] = await Promise.all([
          loadOrgAnalyses(activeOrgId),
          loadOrgWeights(activeOrgId),
          loadOrgAuditLogs(activeOrgId),
          loadOrgPriceAlerts(activeOrgId),
        ]);
        const vMap: Record<string, Partial<ValuationAssumptions>> = {};
        const nMap: Record<string, string> = {};
        const sMap: Record<string, 'rascunho' | 'revisado' | 'aprovado'> = {};
        const imported: AssetRawData[] = [];
        for (const [ticker, rec] of Object.entries(orgAnalyses) as Array<[string, WorkspaceAnalysisRecord]>) {
          if (rec.valuationOverrides) vMap[ticker] = rec.valuationOverrides;
          if (rec.analystNotes) nMap[ticker] = rec.analystNotes;
          if (rec.status) sMap[ticker] = rec.status;
          if (rec.customAssetData && (rec.customAssetData as unknown as AssetRawData).balanceSheets) {
            imported.push(rec.customAssetData as unknown as AssetRawData);
          }
        }
        setValuationOverridesMap(vMap);
        setAnalystNotesMap(nMap);
        setApprovalStatusMap(sMap);
        if (imported.length > 0) setCustomAssets(imported);
        if (orgWeights) setWeights(orgWeights);
        setPriceAlertsMap(orgAlerts);
        setAuditLogs(logs);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Falha ao carregar dados da organização.');
      }
    })();
  }, [user, activeOrgId, showToast]);

  const activeOrg = useMemo(
    () => orgs.find((o) => o.id === activeOrgId) ?? null,
    [orgs, activeOrgId]
  );

  const allRawAssets = useMemo(() => {
    const map = new Map<string, AssetRawData>();
    for (const a of B3_ASSETS) map.set(a.ticker, a);
    for (const c of customAssets) map.set(c.ticker, c);
    return Array.from(map.values()).map((asset) => {
      const liveQ = liveQuotesMap[asset.ticker];
      if (liveQ && liveQ.status === 'live' && liveQ.price !== null) {
        return {
          ...asset,
          market: {
            ...asset.market,
            price: liveQ.price,
            priceDate: liveQ.marketTime ? liveQ.marketTime.slice(0, 10) : asset.market.priceDate,
            priceSource: liveQ.source,
          },
        };
      }
      return asset;
    });
  }, [customAssets, liveQuotesMap]);

  const allAnalyses = useMemo(
    () =>
      allRawAssets.map((asset) =>
        runIntegratedAnalysis(asset, {
          weights,
          valuationOverrides: valuationOverridesMap[asset.ticker],
        })
      ),
    [allRawAssets, weights, valuationOverridesMap]
  );

  const currentAnalysis = useMemo(
    () => allAnalyses.find((a) => a.asset.ticker === activeTicker) ?? allAnalyses[0],
    [allAnalyses, activeTicker]
  );

  const triggeredAlerts = useMemo(
    () =>
      allAnalyses.filter((a) =>
        isPriceAlertTriggered(priceAlertsMap[a.asset.ticker], a.valuation.currentPrice)
      ),
    [allAnalyses, priceAlertsMap]
  );

  const canEditTenant = !user || activeOrg?.role === 'admin' || activeOrg?.role === 'analyst';
  const canApproveTenant = !user || activeOrg?.role === 'admin';

  const persistTickerWorkspace = useCallback(
    async (
      ticker: string,
      actionLabel: string,
      details: string,
      patch?: {
        notes?: string;
        status?: 'rascunho' | 'revisado' | 'aprovado';
        overrides?: Partial<ValuationAssumptions>;
        customAsset?: AssetRawData;
      }
    ) => {
      if (!user || !activeOrgId) {
        showToast('Alteração aplicada localmente (conecte-se com Google para salvar na nuvem).');
        return;
      }
      await saveOrgAssetAnalysis(activeOrgId, user, {
        ticker,
        status: patch?.status ?? approvalStatusMap[ticker] ?? 'rascunho',
        analystNotes: patch?.notes ?? analystNotesMap[ticker] ?? '',
        valuationOverrides: patch?.overrides ?? valuationOverridesMap[ticker],
        customAssetData: patch?.customAsset
          ? (patch.customAsset as unknown as Record<string, unknown>)
          : undefined,
      });
      await appendOrgAuditLog(activeOrgId, user, actionLabel, details, ticker);
      const updatedLogs = await loadOrgAuditLogs(activeOrgId);
      setAuditLogs(updatedLogs);
      showToast(`${actionLabel} salvo na organização ${activeOrg?.name ?? ''}.`);
    },
    [user, activeOrgId, approvalStatusMap, analystNotesMap, valuationOverridesMap, activeOrg?.name, showToast]
  );

  const selectTicker = useCallback((ticker: string) => {
    setActiveTicker(ticker);
    setNavView('asset');
    setAssetTab('overview');
    setSidebarOpen(false);
  }, []);

  const toggleCompareTicker = useCallback((ticker: string) => {
    setSelectedCompareTickers((prev) => {
      if (prev.includes(ticker)) return prev.filter((t) => t !== ticker);
      if (prev.length >= 4) return [...prev.slice(1), ticker];
      return [...prev, ticker];
    });
  }, []);

  const refreshQuote = useCallback(
    async (ticker: string) => {
      setFetchingQuote(true);
      try {
        const res = await fetch(`/api/collector/quote/${encodeURIComponent(ticker)}`);
        const json = (await res.json()) as LiveQuoteInfo;
        setLiveQuotesMap((prev) => ({ ...prev, [ticker]: json }));
        if (json.status === 'live' && json.price !== null) {
          const triggered = isPriceAlertTriggered(priceAlertsMap[ticker], json.price);
          showToast(
            triggered
              ? `Alerta atingido em ${ticker}: R$ ${json.price.toFixed(2)} (${json.source})`
              : `Cotação ${ticker} atualizada: R$ ${json.price.toFixed(2)} (${json.source})`
          );
        }
      } catch {
        showToast('Falha ao consultar cotação pública B3.');
      } finally {
        setFetchingQuote(false);
      }
    },
    [priceAlertsMap, showToast]
  );

  const savePriceAlert = useCallback(
    async (alert: PriceAlertRecord) => {
      const nextMap = { ...priceAlertsMap, [alert.ticker]: alert };
      setPriceAlertsMap(nextMap);

      const matchedAsset = allAnalyses.find((a) => a.asset.ticker === alert.ticker);
      const triggeredNow = matchedAsset
        ? isPriceAlertTriggered(alert, matchedAsset.valuation.currentPrice)
        : false;

      if (!user || !activeOrgId) {
        try {
          localStorage.setItem(LOCAL_ALERTS_KEY, JSON.stringify(nextMap));
        } catch {
          // ignore
        }
        showToast(
          triggeredNow
            ? `Alerta de ${alert.ticker} salvo localmente — patamar já atingido.`
            : `Alerta de ${alert.ticker} salvo localmente.`
        );
        return;
      }

      await saveOrgPriceAlert(activeOrgId, user, alert);
      await appendOrgAuditLog(
        activeOrgId,
        user,
        'SET_PRICE_ALERT',
        `${alert.ticker}: ${alert.direction === 'lte' ? '<=' : '>='} R$ ${alert.targetPrice.toFixed(2)} (${alert.enabled ? 'ativo' : 'pausado'})`,
        alert.ticker
      );
      setAuditLogs(await loadOrgAuditLogs(activeOrgId));
      showToast(
        triggeredNow
          ? `Alerta de ${alert.ticker} salvo — patamar atingido na cotação atual.`
          : `Alerta de ${alert.ticker} salvo na organização ${activeOrg?.name ?? ''}.`
      );
    },
    [priceAlertsMap, allAnalyses, user, activeOrgId, activeOrg?.name, showToast]
  );

  const deletePriceAlert = useCallback(
    async (ticker: string) => {
      const nextMap = { ...priceAlertsMap };
      delete nextMap[ticker];
      setPriceAlertsMap(nextMap);

      if (!user || !activeOrgId) {
        try {
          localStorage.setItem(LOCAL_ALERTS_KEY, JSON.stringify(nextMap));
        } catch {
          // ignore
        }
        showToast(`Alerta de ${ticker} removido localmente.`);
        return;
      }

      await deleteOrgPriceAlert(activeOrgId, ticker);
      await appendOrgAuditLog(
        activeOrgId,
        user,
        'DELETE_PRICE_ALERT',
        `Alerta de preço-alvo removido para ${ticker}.`,
        ticker
      );
      setAuditLogs(await loadOrgAuditLogs(activeOrgId));
      showToast(`Alerta de ${ticker} removido.`);
    },
    [priceAlertsMap, user, activeOrgId, showToast]
  );

  const verifyAlertQuotes = useCallback(async () => {
    const allAlerts = Object.values(priceAlertsMap);
    const targetTickers = (allAlerts.some((a) => a.enabled)
      ? allAlerts.filter((a) => a.enabled)
      : allAlerts
    ).map((a) => a.ticker);
    if (targetTickers.length === 0) return;

    setFetchingQuote(true);
    try {
      const results = await Promise.all(
        targetTickers.map(async (ticker) => {
          try {
            const res = await fetch(`/api/collector/quote/${encodeURIComponent(ticker)}`);
            const json = (await res.json()) as LiveQuoteInfo;
            return [ticker, json] as const;
          } catch {
            return null;
          }
        })
      );

      const updatedQuotes: Record<string, LiveQuoteInfo> = {};
      let liveCount = 0;
      for (const item of results) {
        if (item) {
          updatedQuotes[item[0]] = item[1];
          if (item[1].status === 'live' && item[1].price !== null) liveCount += 1;
        }
      }

      setLiveQuotesMap((prev) => ({ ...prev, ...updatedQuotes }));

      const triggeredNowCount = targetTickers.filter((ticker) => {
        const freshQuote = updatedQuotes[ticker];
        const fallbackPrice =
          allAnalyses.find((a) => a.asset.ticker === ticker)?.valuation.currentPrice ?? 0;
        const effectivePrice =
          freshQuote?.status === 'live' && freshQuote.price !== null
            ? freshQuote.price
            : fallbackPrice;
        return isPriceAlertTriggered(priceAlertsMap[ticker], effectivePrice);
      }).length;

      showToast(
        liveCount > 0
          ? `Cotações verificadas (${liveCount}/${targetTickers.length} online). ${triggeredNowCount} alerta(s) atingido(s).`
          : `Fontes públicas indisponíveis no momento. ${triggeredNowCount} alerta(s) atingido(s) pelos preços de referência.`
      );
    } finally {
      setFetchingQuote(false);
    }
  }, [priceAlertsMap, allAnalyses, showToast]);

  const downloadAppZip = useCallback(async () => {
    if (downloadingZip) return;
    setDownloadingZip(true);
    try {
      const res = await fetch('/api/export/app-zip');
      if (!res.ok) throw new Error(`Erro HTTP ${res.status} ao gerar pacote do app.`);
      const blob = await res.blob();
      const fileCount = res.headers.get('X-Archive-Files');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'apice-research-app.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const sizeKb = (blob.size / 1024).toFixed(0);
      showToast(
        `Download iniciado: apice-research-app.zip (${sizeKb} KB${fileCount ? `, ${fileCount} arquivos` : ''}).`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Falha ao baixar arquivo ZIP do aplicativo.');
    } finally {
      setDownloadingZip(false);
    }
  }, [downloadingZip, showToast]);

  const signInWithGoogle = useCallback(async () => {
    try {
      await loginWithGoogle();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Falha ao autenticar com Google.');
    }
  }, [showToast]);

  const signOutUser = useCallback(async () => {
    await logoutUser();
  }, []);

  const createOrg = useCallback(
    async (name: string, cnpj?: string) => {
      if (!user) return;
      const created = await createNewOrganization(user, name, cnpj);
      setOrgs((prev) => [...prev, created]);
      setActiveOrgId(created.id);
      showToast(`Organização "${created.name}" criada.`);
    },
    [user, showToast]
  );

  const importCustomAsset = useCallback(
    async (asset: AssetRawData) => {
      setCustomAssets((prev) => [...prev.filter((p) => p.ticker !== asset.ticker), asset]);
      setActiveTicker(asset.ticker);
      setNavView('asset');
      setAssetTab('overview');
      await persistTickerWorkspace(
        asset.ticker,
        'IMPORT_ASSET',
        `Ativo ${asset.ticker} validado contabilmente e importado.`,
        { customAsset: asset }
      );
    },
    [persistTickerWorkspace]
  );

  const updateAnalystNotes = useCallback(
    (ticker: string, notes: string) => {
      setAnalystNotesMap((prev) => ({ ...prev, [ticker]: notes }));
      void persistTickerWorkspace(
        ticker,
        'UPDATE_NOTES',
        'Notas qualitativas do analista atualizadas.',
        { notes }
      );
    },
    [persistTickerWorkspace]
  );

  const updateApprovalStatus = useCallback(
    (ticker: string, status: 'rascunho' | 'revisado' | 'aprovado') => {
      setApprovalStatusMap((prev) => ({ ...prev, [ticker]: status }));
      void persistTickerWorkspace(ticker, 'UPDATE_STATUS', `Status alterado para ${status}.`, {
        status,
      });
    },
    [persistTickerWorkspace]
  );

  const setAiSummary = useCallback((ticker: string, text: string) => {
    setAiSummariesMap((prev) => ({ ...prev, [ticker]: text }));
  }, []);

  const changeValuationOverrides = useCallback(
    (ticker: string, next: Partial<ValuationAssumptions>) => {
      setValuationOverridesMap((prev) => ({ ...prev, [ticker]: next }));
    },
    []
  );

  const resetValuationOverrides = useCallback(
    (ticker: string) => {
      setValuationOverridesMap((prev) => {
        const copy = { ...prev };
        delete copy[ticker];
        return copy;
      });
      showToast('Premissas restauradas ao padrão fundamentado do ativo.');
    },
    [showToast]
  );

  const saveValuationOverrides = useCallback(
    async (ticker: string) => {
      await persistTickerWorkspace(
        ticker,
        'UPDATE_VALUATION',
        'Premissas interativas de valuation persistidas.',
        { overrides: valuationOverridesMap[ticker] }
      );
    },
    [persistTickerWorkspace, valuationOverridesMap]
  );

  const saveWeightsPolicy = useCallback(async () => {
    if (!user || !activeOrgId) {
      showToast('Pesos aplicados na sessão atual (conecte-se para salvar no Firestore).');
      return;
    }
    await saveOrgWeights(activeOrgId, user, weights);
    await appendOrgAuditLog(
      activeOrgId,
      user,
      'UPDATE_WEIGHTS',
      `Pesos globais ${(weights.overall.financialWeight * 100).toFixed(0)}/${(weights.overall.qualitativeWeight * 100).toFixed(0)}/${(weights.overall.valuationWeight * 100).toFixed(0)}`
    );
    setAuditLogs(await loadOrgAuditLogs(activeOrgId));
    showToast('Política de pesos salva na organização.');
  }, [user, activeOrgId, weights, showToast]);

  const value: ResearchContextValue = {
    darkMode,
    toggleDarkMode,
    sidebarOpen,
    setSidebarOpen,
    navView,
    setNavView,
    assetTab,
    setAssetTab,
    activeTicker,
    selectTicker,
    allAnalyses,
    currentAnalysis,
    selectedCompareTickers,
    toggleCompareTicker,
    weights,
    setWeights,
    saveWeightsPolicy,
    valuationOverridesMap,
    changeValuationOverrides,
    resetValuationOverrides,
    saveValuationOverrides,
    analystNotesMap,
    updateAnalystNotes,
    approvalStatusMap,
    updateApprovalStatus,
    aiSummariesMap,
    setAiSummary,
    priceAlertsMap,
    triggeredAlerts,
    savePriceAlert,
    deletePriceAlert,
    verifyAlertQuotes,
    macro,
    loadingMacro,
    refreshMacro,
    liveQuotesMap,
    fetchingQuote,
    refreshQuote,
    inspectedIndicator,
    setInspectedIndicator,
    user,
    orgs,
    activeOrgId,
    setActiveOrgId,
    activeOrg,
    auditLogs,
    canEditTenant,
    canApproveTenant,
    signInWithGoogle,
    signOutUser,
    createOrg,
    importCustomAsset,
    toastMsg,
    showToast,
    downloadingZip,
    downloadAppZip,
  };

  return <ResearchContext.Provider value={value}>{children}</ResearchContext.Provider>;
}

export function useResearch(): ResearchContextValue {
  const ctx = useContext(ResearchContext);
  if (!ctx) {
    throw new Error('useResearch deve ser utilizado dentro de ResearchProvider.');
  }
  return ctx;
}
