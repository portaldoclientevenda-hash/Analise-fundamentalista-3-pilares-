import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  BellRing,
  Database,
  FilePlus2,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { formatIndicatorValue } from '../engine/financial/mathUtils.ts';
import { IntegratedAssetAnalysis } from '../engine/integrated/integratedEngine.ts';
import { SECTOR_PROFILES } from '../engine/sectors/sectorProfiles.ts';
import { AssetRawData, SectorId } from '../engine/types.ts';
import {
  isPriceAlertTriggered,
  PriceAlertDirection,
  PriceAlertRecord,
} from '../firebase.ts';

export interface MacroSeriesItem {
  seriesId: number;
  label: string;
  unit: string;
  value: number | null;
  referenceDate: string | null;
  source: string;
  status: 'live' | 'unavailable';
  error?: string;
}

export interface MacroSnapshotData {
  selicMetaPct: MacroSeriesItem;
  cdiAnualPct: MacroSeriesItem;
  ipca12mPct: MacroSeriesItem;
  ptaxUsdBrl: MacroSeriesItem;
  collectedAt: string;
}

export function MarketOverview({
  analyses,
  macro,
  isLoadingMacro,
  onRefreshMacro,
  onSelectTicker,
  selectedCompareTickers,
  onToggleCompareTicker,
  onImportAsset,
  priceAlertsMap,
  canEditAlerts,
  checkingAlerts,
  onVerifyAlertQuotes,
  onSavePriceAlert,
  onDeletePriceAlert,
}: {
  analyses: IntegratedAssetAnalysis[];
  macro: MacroSnapshotData | null;
  isLoadingMacro: boolean;
  onRefreshMacro: () => void;
  onSelectTicker: (ticker: string) => void;
  selectedCompareTickers: string[];
  onToggleCompareTicker: (ticker: string) => void;
  onImportAsset: (asset: AssetRawData) => Promise<void>;
  priceAlertsMap: Record<string, PriceAlertRecord>;
  canEditAlerts: boolean;
  checkingAlerts: boolean;
  onVerifyAlertQuotes: () => Promise<void>;
  onSavePriceAlert: (alert: PriceAlertRecord) => Promise<void>;
  onDeletePriceAlert: (ticker: string) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState<'all' | SectorId>('all');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const alertFormRef = useRef<HTMLDivElement | null>(null);
  const [alertTicker, setAlertTicker] = useState<string>(analyses[0]?.asset.ticker ?? 'WEGE3');
  const selectedAlertAnalysis = useMemo(
    () => analyses.find((a) => a.asset.ticker === alertTicker) ?? analyses[0],
    [analyses, alertTicker]
  );
  const existingAlert = selectedAlertAnalysis
    ? priceAlertsMap[selectedAlertAnalysis.asset.ticker]
    : undefined;

  const [alertDirection, setAlertDirection] = useState<PriceAlertDirection>(
    existingAlert?.direction ?? 'lte'
  );
  const [alertTargetInput, setAlertTargetInput] = useState<string>(
    existingAlert
      ? String(existingAlert.targetPrice)
      : selectedAlertAnalysis
        ? selectedAlertAnalysis.valuation.reconciledFairValue.toFixed(2)
        : ''
  );
  const [alertNoteInput, setAlertNoteInput] = useState<string>(existingAlert?.note ?? '');
  const [alertEnabledInput, setAlertEnabledInput] = useState<boolean>(
    existingAlert?.enabled ?? true
  );
  const [savingAlert, setSavingAlert] = useState(false);

  useEffect(() => {
    if (!selectedAlertAnalysis) return;
    const current = priceAlertsMap[selectedAlertAnalysis.asset.ticker];
    setAlertDirection(current?.direction ?? 'lte');
    setAlertTargetInput(
      current
        ? String(current.targetPrice)
        : selectedAlertAnalysis.valuation.reconciledFairValue.toFixed(2)
    );
    setAlertNoteInput(current?.note ?? '');
    setAlertEnabledInput(current?.enabled ?? true);
  }, [selectedAlertAnalysis, priceAlertsMap]);

  const configuredAlerts = useMemo(
    () =>
      analyses
        .map((a) => ({
          analysis: a,
          alert: priceAlertsMap[a.asset.ticker],
          triggered: isPriceAlertTriggered(
            priceAlertsMap[a.asset.ticker],
            a.valuation.currentPrice
          ),
        }))
        .filter((item): item is { analysis: IntegratedAssetAnalysis; alert: PriceAlertRecord; triggered: boolean } =>
          Boolean(item.alert)
        ),
    [analyses, priceAlertsMap]
  );

  const triggeredAlerts = useMemo(
    () => configuredAlerts.filter((item) => item.triggered),
    [configuredAlerts]
  );

  const handleAlertSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAlertAnalysis) return;
    const numeric = Number(alertTargetInput.replace(',', '.'));
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    setSavingAlert(true);
    try {
      await onSavePriceAlert({
        ticker: selectedAlertAnalysis.asset.ticker,
        targetPrice: Number(numeric.toFixed(2)),
        direction: alertDirection,
        enabled: alertEnabledInput,
        note: alertNoteInput.trim() || undefined,
      });
    } finally {
      setSavingAlert(false);
    }
  };

  const handleQuickConfigureTicker = (ticker: string) => {
    setAlertTicker(ticker);
    alertFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const filtered = analyses
    .filter((a) => {
      const q = search.trim().toLowerCase();
      const matchesQ =
        !q ||
        a.asset.ticker.toLowerCase().includes(q) ||
        a.asset.name.toLowerCase().includes(q) ||
        a.sectorName.toLowerCase().includes(q);
      const matchesSector = sectorFilter === 'all' || a.asset.sectorId === sectorFilter;
      return matchesQ && matchesSector;
    })
    .sort((a, b) => b.scores.overallScore - a.scores.overallScore);

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError(null);
    setImporting(true);
    try {
      const parsed = JSON.parse(importJsonText) as AssetRawData;
      const valRes = await fetch('/api/assets/validate-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const valJson = (await valRes.json()) as { valid: boolean; errors?: string[] };
      if (!valRes.ok || !valJson.valid) {
        throw new Error(valJson.errors?.join(' ') || 'Erro na validação contábil.');
      }
      await onImportAsset(parsed);
      setShowImportModal(false);
      setImportJsonText('');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'JSON inválido.');
    } finally {
      setImporting(false);
    }
  };

  const macroCards = macro
    ? [macro.selicMetaPct, macro.cdiAnualPct, macro.ipca12mPct, macro.ptaxUsdBrl]
    : [];

  return (
    <div className="space-y-6">
      {/* Triggered Price Alerts Dashboard Notification Banner */}
      {triggeredAlerts.length > 0 && (
        <div className="bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900 dark:text-emerald-200">
              <BellRing className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                Notificação de Preço-Alvo: {triggeredAlerts.length}{' '}
                {triggeredAlerts.length === 1 ? 'ativo atingiu' : 'ativos atingiram'} o patamar definido
              </span>
            </div>
            <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {triggeredAlerts.length} {triggeredAlerts.length === 1 ? 'gatilho ativo' : 'gatilhos ativos'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {triggeredAlerts.map(({ analysis, alert }) => (
              <button
                key={analysis.asset.ticker}
                type="button"
                onClick={() => onSelectTicker(analysis.asset.ticker)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 text-xs hover:border-emerald-500 transition-colors whitespace-nowrap cursor-pointer"
              >
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                  {analysis.asset.ticker}
                </span>
                <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-300 font-semibold">
                  R$ {analysis.valuation.currentPrice.toFixed(2)}
                </span>
                <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                  {alert.direction === 'lte' ? '<=' : '>='} R$ {alert.targetPrice.toFixed(2)}
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Macro Strip (BCB SGS Live) — Unified Single-Elevation Hairline Grid */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200">
            <Database className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>Parâmetros Macroeconômicos Oficiais (Banco Central · SGS)</span>
          </div>
          <button
            type="button"
            onClick={onRefreshMacro}
            disabled={isLoadingMacro}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMacro ? 'animate-spin' : ''}`} />
            <span>Sincronizar BCB</span>
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
          {macroCards.length === 0 ? (
            <div className="col-span-full px-4 py-4 text-xs text-slate-500">
              Carregando séries públicas do Banco Central...
            </div>
          ) : (
            macroCards.map((m) => (
              <div key={m.seriesId} className="p-4 space-y-1">
                <div className="text-xs text-slate-500 dark:text-slate-400">{m.label}</div>
                <div className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-slate-100">
                  {m.status === 'live' && m.value !== null
                    ? m.unit === 'BRL'
                      ? `R$ ${m.value.toFixed(4)}`
                      : `${m.value.toFixed(2)}%`
                    : 'Indisponível'}
                </div>
                <div className="text-[11px] text-slate-400">
                  {m.status === 'live'
                    ? `BCB SGS #${m.seriesId} · Ref. ${m.referenceDate}`
                    : `Fonte offline · ${m.error ?? 'sem resposta'}`}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Price-Target Alerts Monitor & Quick Configurator */}
      <div
        ref={alertFormRef}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <div>
              <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Alertas de Preço-Alvo ({configuredAlerts.length} configurados · {triggeredAlerts.length}{' '}
                atingidos)
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Defina preços-alvo de entrada (&lt;=) ou realização (&gt;=) e monitore os gatilhos contra a cotação B3.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void onVerifyAlertQuotes()}
            disabled={checkingAlerts || configuredAlerts.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingAlerts ? 'animate-spin' : ''}`} />
            Verificar Cotações dos Alertas
          </button>
        </div>

        <form onSubmit={handleAlertSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs items-end">
          <label className="sm:col-span-2 block space-y-1">
            <span className="text-[11px] text-slate-500 font-medium">Ticker B3</span>
            <select
              value={selectedAlertAnalysis?.asset.ticker ?? alertTicker}
              onChange={(e) => setAlertTicker(e.target.value)}
              className="w-full font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-2"
            >
              {analyses.map((a) => (
                <option key={a.asset.ticker} value={a.asset.ticker}>
                  {a.asset.ticker} (R$ {a.valuation.currentPrice.toFixed(2)})
                </option>
              ))}
            </select>
          </label>

          <label className="sm:col-span-3 block space-y-1">
            <span className="text-[11px] text-slate-500 font-medium">Condição</span>
            <select
              value={alertDirection}
              disabled={!canEditAlerts}
              onChange={(e) => setAlertDirection(e.target.value as PriceAlertDirection)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-2"
            >
              <option value="lte">Preço &lt;= Alvo (Entrada)</option>
              <option value="gte">Preço &gt;= Alvo (Realização)</option>
            </select>
          </label>

          <label className="sm:col-span-2 block space-y-1">
            <span className="text-[11px] text-slate-500 font-medium flex items-center justify-between gap-1">
              <span>Alvo (R$)</span>
              {selectedAlertAnalysis && (
                <button
                  type="button"
                  onClick={() => {
                    setAlertTargetInput(
                      selectedAlertAnalysis.valuation.reconciledFairValue.toFixed(2)
                    );
                    setAlertDirection('lte');
                  }}
                  className="text-[10px] text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                >
                  Justo
                </button>
              )}
            </span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              disabled={!canEditAlerts}
              value={alertTargetInput}
              onChange={(e) => setAlertTargetInput(e.target.value)}
              className="w-full font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-2"
            />
          </label>

          <label className="sm:col-span-2 block space-y-1">
            <span className="text-[11px] text-slate-500 font-medium">Observação</span>
            <input
              type="text"
              maxLength={300}
              disabled={!canEditAlerts}
              value={alertNoteInput}
              onChange={(e) => setAlertNoteInput(e.target.value)}
              placeholder="Ex.: Zona MoS"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-2"
            />
          </label>

          <label className="sm:col-span-1 flex items-center gap-1.5 pb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={alertEnabledInput}
              disabled={!canEditAlerts}
              onChange={(e) => setAlertEnabledInput(e.target.checked)}
              className="rounded border-slate-300 text-teal-600"
            />
            <span>Ativo</span>
          </label>

          <div className="sm:col-span-2 flex items-center justify-end gap-1.5">
            {existingAlert && canEditAlerts && (
              <button
                type="button"
                onClick={() => void onDeletePriceAlert(existingAlert.ticker)}
                title="Remover alerta deste ticker"
                className="p-2 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            {canEditAlerts && (
              <button
                type="submit"
                disabled={savingAlert}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-700 text-white font-medium hover:bg-teal-800 disabled:opacity-50 cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5" />
                {savingAlert ? 'Salvando...' : existingAlert ? 'Atualizar' : 'Definir Alerta'}
              </button>
            )}
          </div>
        </form>

        {configuredAlerts.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            {configuredAlerts.map(({ analysis, alert, triggered }) => {
              const distPct =
                alert.targetPrice > 0
                  ? ((alert.targetPrice - analysis.valuation.currentPrice) /
                      analysis.valuation.currentPrice) *
                    100
                  : 0;
              return (
                <div
                  key={alert.ticker}
                  className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-[11px] ${
                    triggered
                      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                      : alert.enabled
                        ? 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-400'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleQuickConfigureTicker(alert.ticker)}
                    className="font-mono font-bold hover:underline cursor-pointer"
                    title="Editar alerta"
                  >
                    {alert.ticker}
                  </button>
                  <span className="font-mono tabular-nums">
                    {alert.direction === 'lte' ? '<=' : '>='} R$ {alert.targetPrice.toFixed(2)}
                  </span>
                  <span className="font-mono tabular-nums text-[10px]">
                    {triggered
                      ? '· Atingido'
                      : alert.enabled
                        ? `(${distPct >= 0 ? '+' : ''}${distPct.toFixed(1)}%)`
                        : '· Pausado'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filter & Import Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar ticker, empresa ou setor B3..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value as 'all' | SectorId)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
          >
            <option value="all">Todos os 19 Setores B3</option>
            {Object.values(SECTOR_PROFILES).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setShowImportModal(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium hover:opacity-90 cursor-pointer"
        >
          <FilePlus2 className="w-3.5 h-3.5" />
          Importar Demonstrações (JSON)
        </button>
      </div>

      {/* Institutional Screener Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
            <tr>
              <th className="px-3 py-3 text-center">Comp.</th>
              <th className="px-4 py-3 text-left font-semibold">Ativo / Setor</th>
              <th className="px-3 py-3 text-right">Preço</th>
              <th className="px-3 py-3 text-right">Preço-Alvo</th>
              <th className="px-3 py-3 text-right">Valor Justo</th>
              <th className="px-3 py-3 text-right">MoS</th>
              <th className="px-3 py-3 text-right">Fin.</th>
              <th className="px-3 py-3 text-right">Qual.</th>
              <th className="px-3 py-3 text-right">Val.</th>
              <th className="px-3 py-3 text-right">Geral</th>
              <th className="px-3 py-3 text-right">ROE / DY</th>
              <th className="px-3 py-3 text-center">Riscos</th>
              <th className="px-4 py-3 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((a) => {
              const criticalCount = a.alerts.filter(
                (al) => al.severity === 'critico' || al.severity === 'alto_risco'
              ).length;
              const isChecked = selectedCompareTickers.includes(a.asset.ticker);
              const alert = priceAlertsMap[a.asset.ticker];
              const triggered = isPriceAlertTriggered(alert, a.valuation.currentPrice);
              return (
                <tr
                  key={a.asset.ticker}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleCompareTicker(a.asset.ticker)}
                      title="Selecionar para Comparador (2-4 ativos)"
                      className="rounded border-slate-300 text-teal-600 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onSelectTicker(a.asset.ticker)}
                      className="text-left group cursor-pointer"
                    >
                      <div className="font-mono font-bold text-slate-900 dark:text-slate-100 group-hover:text-teal-700 dark:group-hover:text-teal-400">
                        {a.asset.ticker}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {a.asset.name} · {a.sectorName}
                      </div>
                    </button>
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    R$ {a.valuation.currentPrice.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {alert ? (
                      <button
                        type="button"
                        onClick={() => handleQuickConfigureTicker(a.asset.ticker)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold cursor-pointer ${
                          triggered
                            ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                            : alert.enabled
                              ? 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                              : 'border-slate-200 dark:border-slate-800 text-slate-400'
                        }`}
                        title={
                          triggered
                            ? 'Patamar atingido! Clique para editar'
                            : 'Clique para editar preço-alvo'
                        }
                      >
                        {triggered && <BellRing className="w-3 h-3" />}
                        <span>
                          {alert.direction === 'lte' ? '<=' : '>='} {alert.targetPrice.toFixed(2)}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleQuickConfigureTicker(a.asset.ticker)}
                        className="text-[11px] text-slate-400 hover:text-teal-700 dark:hover:text-teal-400 cursor-pointer"
                        title="Definir preço-alvo"
                      >
                        + Alvo
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold">
                    R$ {a.valuation.reconciledFairValue.toFixed(2)}
                  </td>
                  <td
                    className={`px-3 py-3 text-right font-mono tabular-nums font-semibold ${
                      a.valuation.marginOfSafetyPct >= 15
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : a.valuation.marginOfSafetyPct >= 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {a.valuation.marginOfSafetyPct.toFixed(1)}%
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {a.scores.financial.pillarScore}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {a.scores.qualitative.pillarScore}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {a.scores.valuation.pillarScore}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                    {a.scores.overallScore}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    {a.asset.assetType === 'fii'
                      ? formatIndicatorValue(a.financial.indicators.dividend_yield?.value ?? null, '%')
                      : formatIndicatorValue(a.financial.indicators.roe?.value ?? null, '%')}
                  </td>
                  <td className="px-3 py-3 text-center font-mono tabular-nums">
                    {criticalCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {criticalCount}
                      </span>
                    ) : (
                      <span className="text-slate-400">{a.alerts.length}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onSelectTicker(a.asset.ticker)}
                      className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 font-medium hover:underline cursor-pointer"
                    >
                      Analisar
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* JSON Asset Import Modal */}
      {showImportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          onClick={() => setShowImportModal(false)}
        >
          <div
            className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">
                Importar Ativo B3 (Balanço, DRE, DFC & Qualitativo JSON)
              </h3>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Fechar
              </button>
            </div>
            <p className="text-xs text-slate-500">
              O servidor valida obrigatoriamente a equação contábil Ativo = Passivo + Patrimônio Líquido antes de acionar os motores dos 3 pilares.
            </p>
            <form onSubmit={handleImportSubmit} className="space-y-3">
              <textarea
                rows={10}
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                placeholder='Cole aqui o JSON seguindo o schema AssetRawData (ex.: {"ticker":"RADL3","name":"Raia Drogasil",...})'
                className="w-full font-mono text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3"
              />
              {importError && (
                <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg p-2.5">
                  {importError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={importing || !importJsonText.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-medium disabled:opacity-50 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {importing ? 'Validando...' : 'Validar e Analisar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
