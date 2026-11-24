import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Calculator, RefreshCw, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { isFiniteNumber } from '../engine/financial/mathUtils.ts';
import { IntegratedAssetAnalysis } from '../engine/integrated/integratedEngine.ts';
import { simulateInflationAdjustedReturn } from '../engine/integrated/returnSimulator.ts';
import { LiveQuoteInfo } from './asset/OverviewTab.tsx';
import { MacroSnapshotData } from './MarketOverview.tsx';

function formatBrl(val: number): string {
  return val.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function impliedAnnualCagr(currentPrice: number, fairValue: number, years: number, fallbackPct: number): number {
  if (currentPrice <= 0 || fairValue <= 0 || years <= 0) return fallbackPct;
  const raw = (Math.pow(fairValue / currentPrice, 1 / Math.min(10, Math.max(1, years))) - 1) * 100;
  return Number(Math.max(-15, Math.min(35, raw)).toFixed(2));
}

export function ReturnSimulator({
  analyses,
  initialTicker,
  macro,
}: {
  analyses: IntegratedAssetAnalysis[];
  initialTicker: string;
  macro: MacroSnapshotData | null;
}) {
  const liveIpca =
    macro?.ipca12mPct.status === 'live' && isFiniteNumber(macro.ipca12mPct.value)
      ? Number(macro.ipca12mPct.value.toFixed(2))
      : null;
  const liveSelic =
    macro?.selicMetaPct.status === 'live' && isFiniteNumber(macro.selicMetaPct.value)
      ? Number(macro.selicMetaPct.value.toFixed(2))
      : null;

  const [tickerInput, setTickerInput] = useState<string>(initialTicker || 'PETR3');
  const [selectedTicker, setSelectedTicker] = useState<string>(initialTicker || 'WEGE3');
  const [quantity, setQuantity] = useState<number>(100);
  const [pricePerShare, setPricePerShare] = useState<number>(36.5);
  const [horizonYears, setHorizonYears] = useState<number>(5);
  const [priceGrowthPct, setPriceGrowthPct] = useState<number>(9.5);
  const [dividendYieldPct, setDividendYieldPct] = useState<number>(4.0);
  const [reinvestDividends, setReinvestDividends] = useState<boolean>(true);
  const [inflationPct, setInflationPct] = useState<number>(liveIpca ?? 4.5);

  const [fetchingQuote, setFetchingQuote] = useState(false);
  const [quoteInfo, setQuoteInfo] = useState<LiveQuoteInfo | null>(null);

  const matchedAnalysis = useMemo(
    () => analyses.find((a) => a.asset.ticker === selectedTicker.toUpperCase()) ?? null,
    [analyses, selectedTicker]
  );

  // Sync defaults when switching to a covered asset from dropdown/initialTicker
  useEffect(() => {
    if (!matchedAnalysis) return;
    setPricePerShare(Number(matchedAnalysis.valuation.currentPrice.toFixed(2)));
    const dy = matchedAnalysis.financial.indicators.dividend_yield?.value;
    setDividendYieldPct(isFiniteNumber(dy) ? Number(dy.toFixed(2)) : 3.5);
    setPriceGrowthPct(
      Number(matchedAnalysis.valuation.assumptionsUsed.revenueGrowthBasePct.toFixed(2))
    );
    setQuoteInfo(null);
  }, [matchedAnalysis]);

  useEffect(() => {
    if (liveIpca !== null) {
      setInflationPct(liveIpca);
    }
  }, [liveIpca]);

  const handleSelectCoveredAsset = (ticker: string) => {
    const clean = ticker.trim().toUpperCase();
    setTickerInput(clean);
    setSelectedTicker(clean);
  };

  const handleLookupTicker = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = tickerInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean) return;
    setSelectedTicker(clean);
    setFetchingQuote(true);
    try {
      const res = await fetch(`/api/collector/quote/${encodeURIComponent(clean)}`);
      const json = (await res.json()) as LiveQuoteInfo;
      setQuoteInfo(json);
      if (json.status === 'live' && json.price !== null && Number.isFinite(json.price)) {
        setPricePerShare(Number(json.price.toFixed(2)));
      }
    } catch {
      setQuoteInfo({
        ticker: clean,
        price: null,
        changePct: null,
        marketTime: null,
        source: 'Provedores públicos (brapi.dev / Yahoo Finance)',
        status: 'unavailable',
        error: 'Não foi possível consultar a cotação B3 no momento.',
      });
    } finally {
      setFetchingQuote(false);
    }
  };

  const result = useMemo(
    () =>
      simulateInflationAdjustedReturn({
        ticker: selectedTicker,
        quantity,
        pricePerShare,
        horizonYears,
        expectedPriceAppreciationPct: priceGrowthPct,
        expectedDividendYieldPct: dividendYieldPct,
        reinvestDividends,
        inflationRatePct: inflationPct,
        benchmarkRatePct: liveSelic,
      }),
    [
      selectedTicker,
      quantity,
      pricePerShare,
      horizonYears,
      priceGrowthPct,
      dividendYieldPct,
      reinvestDividends,
      inflationPct,
      liveSelic,
    ]
  );

  const chartData = useMemo(
    () =>
      result.rows.map((r) => ({
        ano: r.year === 0 ? 'Hoje' : `Ano ${r.year}`,
        investido: Number(result.investedCapital.toFixed(2)),
        nominal: Number(r.nominalTotal.toFixed(2)),
        real: Number(r.realTotal.toFixed(2)),
        selicReal: r.realBenchmarkTotal !== null ? Number(r.realBenchmarkTotal.toFixed(2)) : undefined,
      })),
    [result]
  );

  return (
    <div className="space-y-6">
      {/* Configuration & Ticker Lookup Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Calculator className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Simulador de Compra & Retorno Real (Inflação Descontada)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Informe qualquer ticker B3 (ex.: PETR3, PETR4, WEGE3), escolha quantas cotas comprar e simule o patrimônio nominal e o poder de compra real descontando o IPCA pela Equação de Fisher.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 text-xs">
            {analyses.slice(0, 6).map((a) => (
              <button
                key={a.asset.ticker}
                type="button"
                onClick={() => handleSelectCoveredAsset(a.asset.ticker)}
                className={`px-2.5 py-1 rounded-lg font-mono border cursor-pointer transition-colors ${
                  selectedTicker === a.asset.ticker
                    ? 'bg-teal-700 text-white border-teal-700'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {a.asset.ticker}
              </button>
            ))}
          </div>
        </div>

        {/* Ticker Search & Quick Quote */}
        <form onSubmit={handleLookupTicker} className="flex flex-wrap items-end gap-2.5 text-xs">
          <label className="w-44 space-y-1">
            <span className="text-slate-500 font-medium">Ticker B3 (qualquer ativo)</span>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                placeholder="Ex.: PETR3, PETR4, WEGE3"
                className="w-full font-mono uppercase pl-8 pr-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={fetchingQuote || !tickerInput.trim()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fetchingQuote ? 'animate-spin' : ''}`} />
            {fetchingQuote ? 'Buscando B3...' : 'Buscar Cotação B3'}
          </button>

          {quoteInfo && (
            <span
              className={`text-xs px-3 py-2 rounded-lg border ${
                quoteInfo.status === 'live'
                  ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                  : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200'
              }`}
            >
              {quoteInfo.status === 'live' && quoteInfo.price !== null
                ? `${quoteInfo.ticker}: R$ ${quoteInfo.price.toFixed(2)} ao vivo (${quoteInfo.source})`
                : `${quoteInfo.ticker}: cotação pública indisponível no momento — ajuste o preço por cota manualmente abaixo.`}
            </span>
          )}

          {!quoteInfo && matchedAnalysis && (
            <span className="text-xs text-slate-500 py-2">
              Ativo na cobertura 3 Pilares: <strong>{matchedAnalysis.asset.name}</strong> ({matchedAnalysis.sectorName})
            </span>
          )}
        </form>

        {/* Numeric Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="space-y-1">
            <label className="block space-y-1">
              <span className="text-slate-500 font-medium">Quantidade de Cotas</span>
              <input
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                className="w-full font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
              />
            </label>
            <div className="flex gap-1">
              {[10, 100, 500, 1000].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuantity(q)}
                  className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-mono text-[10px] hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <label className="space-y-1 block">
            <span className="text-slate-500 font-medium">Preço por Cota (R$)</span>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={pricePerShare}
              onChange={(e) => setPricePerShare(Math.max(0.01, Number(e.target.value) || 0.01))}
              className="w-full font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
            />
          </label>

          <div className="space-y-1">
            <label className="block space-y-1">
              <span className="text-slate-500 font-medium">Horizonte (Anos)</span>
              <input
                type="number"
                min={1}
                max={30}
                step={1}
                value={horizonYears}
                onChange={(e) =>
                  setHorizonYears(Math.max(1, Math.min(30, Math.round(Number(e.target.value) || 1))))
                }
                className="w-full font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
              />
            </label>
            <div className="flex gap-1">
              {[1, 3, 5, 10, 20].map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setHorizonYears(y)}
                  className={`px-1.5 py-0.5 rounded border font-mono text-[10px] cursor-pointer ${
                    horizonYears === y
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {y}a
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="block space-y-1">
              <span className="text-slate-500 font-medium">Valorização Cota (% a.a.)</span>
              <input
                type="number"
                step={0.25}
                value={priceGrowthPct}
                onChange={(e) => setPriceGrowthPct(Number(e.target.value) || 0)}
                className="w-full font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
              />
            </label>
            {matchedAnalysis && (
              <div className="flex flex-wrap gap-1">
                {(['conservador', 'base', 'otimista'] as const).map((k) => {
                  const sc = matchedAnalysis.valuation.scenarios[k];
                  const valPct = impliedAnnualCagr(
                    pricePerShare,
                    sc.fairValuePerShare,
                    horizonYears,
                    sc.revenueCagrPct
                  );
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setPriceGrowthPct(valPct)}
                      className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[10px] capitalize hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      title={`Usar taxa implícita do cenário ${sc.name} (Justo R$ ${sc.fairValuePerShare.toFixed(2)})`}
                    >
                      {k.slice(0, 4)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="block space-y-1">
              <span className="text-slate-500 font-medium">Dividend Yield (% a.a.)</span>
              <input
                type="number"
                min={0}
                step={0.25}
                value={dividendYieldPct}
                onChange={(e) => setDividendYieldPct(Math.max(0, Number(e.target.value) || 0))}
                className="w-full font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={reinvestDividends}
                onChange={(e) => setReinvestDividends(e.target.checked)}
                className="rounded border-slate-300 text-teal-600"
              />
              <span>Reinvestir dividendos</span>
            </label>
          </div>

          <div className="space-y-1">
            <label className="block space-y-1">
              <span className="text-slate-500 font-medium">Inflação IPCA (% a.a.)</span>
              <input
                type="number"
                step={0.1}
                value={inflationPct}
                onChange={(e) => setInflationPct(Number(e.target.value) || 0)}
                className="w-full font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
              />
            </label>
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>{liveIpca !== null ? `BCB SGS: ${liveIpca.toFixed(2)}%` : 'Premissa manual'}</span>
              {liveIpca !== null && (
                <button
                  type="button"
                  onClick={() => setInflationPct(liveIpca)}
                  className="text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                >
                  Usar IPCA BCB
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4 Summary Result Strip — Unified Single-Elevation Hairline Grid */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4">
          <div className="text-xs text-slate-500">Capital Investido Hoje</div>
          <div className="font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
            {formatBrl(result.investedCapital)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
            {result.quantity.toLocaleString('pt-BR')} cotas × {formatBrl(result.pricePerShare)}
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500">Montante Nominal ({horizonYears}a)</div>
          <div className="font-mono tabular-nums text-xl font-bold text-sky-700 dark:text-sky-400 mt-1">
            {formatBrl(result.finalNominalValue)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
            {result.nominalTotalReturnPct >= 0 ? '+' : ''}
            {result.nominalTotalReturnPct.toFixed(1)}% ({result.nominalAnnualizedPct.toFixed(2)}% a.a.)
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Retorno Real (Sem Inflação)</span>
            {result.beatsInflation ? (
              <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            )}
          </div>
          <div
            className={`font-mono tabular-nums text-xl font-bold mt-1 ${
              result.beatsInflation
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {formatBrl(result.finalRealValue)}
          </div>
          <div className="text-[11px] font-mono tabular-nums mt-1 text-slate-600 dark:text-slate-300">
            {result.realTotalReturnPct >= 0 ? '+' : ''}
            {result.realTotalReturnPct.toFixed(1)}% real ({result.realAnnualizedPct >= 0 ? '+' : ''}
            {result.realAnnualizedPct.toFixed(2)}% a.a.)
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-500">Erosão pela Inflação</div>
          <div className="font-mono tabular-nums text-xl font-bold text-amber-700 dark:text-amber-400 mt-1">
            -{formatBrl(result.inflationErosionBrl)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
            IPCA acumulado: +{result.cumulativeInflationPct.toFixed(1)}% · {result.finalShares.toFixed(1)} cotas
          </div>
        </div>
      </div>

      {/* Nominal vs Inflation-Adjusted Chart */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Evolução do Patrimônio: Valor Nominal vs Poder de Compra Real ({result.ticker})
            </h3>
            <p className="text-xs text-slate-500">
              A área sombreada entre a linha nominal e a linha real mostra o poder de compra corroído pelo IPCA ({inflationPct.toFixed(2)}% a.a.).
            </p>
          </div>
          {result.realBenchmarkFinal !== null && liveSelic !== null && (
            <span className="text-xs font-mono px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
              Selic Real ({liveSelic.toFixed(2)}% - IPCA): {formatBrl(result.realBenchmarkFinal)}
            </span>
          )}
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
              <XAxis dataKey="ano" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `R$ ${(v / 1000).toFixed(1)}k` : `R$ ${v.toFixed(0)}`
                }
                width={68}
              />
              <Tooltip
                formatter={(value: unknown, name: unknown) => [
                  typeof value === 'number' ? formatBrl(value) : String(value),
                  String(name),
                ]}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="nominal"
                name="Patrimônio Nominal (R$)"
                stroke="#0284c7"
                fill="#0284c7"
                fillOpacity={0.12}
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="real"
                name="Patrimônio Real — Inflação Descontada (R$)"
                stroke="#0f766e"
                fill="#0f766e"
                fillOpacity={0.18}
                strokeWidth={2.5}
              />
              <Line
                type="monotone"
                dataKey="investido"
                name="Capital Investido (R$)"
                stroke="#94a3b8"
                strokeDasharray="4 4"
                dot={false}
              />
              {result.realBenchmarkFinal !== null && (
                <Line
                  type="monotone"
                  dataKey="selicReal"
                  name="Benchmark Selic Real (R$)"
                  stroke="#d97706"
                  strokeDasharray="5 3"
                  dot={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Causal Explanation ("Por que e Como Influencia") */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
        <div className="p-5 space-y-2 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Interpretação do Resultado: Por quê e Como Cada Variável Influencia
          </h3>
          <p className="text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
            {result.whySummary}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-slate-200 dark:bg-slate-800">
          <div className="bg-white dark:bg-slate-900 p-4 space-y-1">
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              1. Cotas & Preço de Entrada
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              {result.directInfluenceNotes.priceAndQuantity}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 space-y-1">
            <div className="font-semibold text-amber-700 dark:text-amber-400">
              2. Desconto Direto da Inflação (Equação de Fisher)
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              {result.directInfluenceNotes.inflationImpact}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 space-y-1">
            <div className="font-semibold text-teal-700 dark:text-teal-400">
              3. Efeito dos Dividendos
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              {result.directInfluenceNotes.dividendReinvestmentImpact}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 space-y-1">
            <div className="font-semibold text-rose-700 dark:text-rose-400">
              4. Sensibilidade a Alta da Inflação (+2 p.p.)
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              {result.directInfluenceNotes.sensitivityNote}
            </p>
          </div>
        </div>
      </div>

      {/* Year-by-Year Schedule Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Ano</th>
              <th className="text-right px-3 py-3">Cotas</th>
              <th className="text-right px-3 py-3">Preço Est. Cota</th>
              <th className="text-right px-3 py-3">Proventos no Ano</th>
              <th className="text-right px-3 py-3">Patrimônio Nominal</th>
              <th className="text-right px-3 py-3">Inflação Acum.</th>
              <th className="text-right px-3 py-3 font-semibold">Patrimônio Real (Hoje)</th>
              <th className="text-right px-4 py-3">Ganho Real %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
            {result.rows.map((r) => (
              <tr key={r.year} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                <td className="px-4 py-2.5 font-sans font-semibold">
                  {r.year === 0 ? 'Compra (Ano 0)' : `Ano ${r.year}`}
                </td>
                <td className="px-3 py-2.5 text-right">{r.shares.toFixed(1)}</td>
                <td className="px-3 py-2.5 text-right">{formatBrl(r.sharePriceNominal)}</td>
                <td className="px-3 py-2.5 text-right">{formatBrl(r.annualDividendsNominal)}</td>
                <td className="px-3 py-2.5 text-right">{formatBrl(r.nominalTotal)}</td>
                <td className="px-3 py-2.5 text-right text-slate-500">
                  +{((r.inflationFactor - 1) * 100).toFixed(1)}%
                </td>
                <td className="px-3 py-2.5 text-right font-bold text-teal-700 dark:text-teal-400">
                  {formatBrl(r.realTotal)}
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-semibold ${
                    r.realGainPct >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {r.realGainPct >= 0 ? '+' : ''}
                  {r.realGainPct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
