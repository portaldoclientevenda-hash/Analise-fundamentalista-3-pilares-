import React, { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrencyBrlM, formatIndicatorValue } from '../../engine/financial/mathUtils.ts';
import { IntegratedAssetAnalysis } from '../../engine/integrated/integratedEngine.ts';
import { IndicatorDiagnostic } from '../../engine/types.ts';
import { KeyIndicatorsChart } from './KeyIndicatorsChart.tsx';

type FinSubTab =
  | 'bp'
  | 'dre'
  | 'dfc'
  | 'liquidez'
  | 'endividamento'
  | 'rentabilidade'
  | 'eficiencia'
  | 'crescimento'
  | 'geracao_caixa'
  | 'qualidade_lucros'
  | 'mercado'
  | 'historico';

const SUB_TABS: Array<{ id: FinSubTab; label: string }> = [
  { id: 'bp', label: 'Balanço Patrimonial' },
  { id: 'dre', label: 'DRE' },
  { id: 'dfc', label: 'Fluxo de Caixa' },
  { id: 'liquidez', label: 'Liquidez' },
  { id: 'endividamento', label: 'Endividamento' },
  { id: 'rentabilidade', label: 'Rentabilidade' },
  { id: 'eficiencia', label: 'Eficiência' },
  { id: 'crescimento', label: 'Crescimento (CAGR)' },
  { id: 'geracao_caixa', label: 'Geração de Caixa' },
  { id: 'qualidade_lucros', label: 'Qualidade dos Lucros' },
  { id: 'mercado', label: 'Mercado' },
  { id: 'historico', label: 'Série Histórica' },
];

export function FinancialTab({
  analysis,
  onSelectIndicator,
}: {
  analysis: IntegratedAssetAnalysis;
  onSelectIndicator: (ind: IndicatorDiagnostic) => void;
}) {
  const [subTab, setSubTab] = useState<FinSubTab>('bp');
  const fin = analysis.financial;
  const asset = analysis.asset;

  const renderCategoryIndicators = (category: IndicatorDiagnostic['category']) => {
    const items = fin.indicatorsList.filter((i) => i.category === category);
    if (items.length === 0) {
      return (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 text-xs text-slate-500">
          Sem indicadores nesta categoria para este tipo de ativo.
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectIndicator(item)}
            className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:border-teal-500/70 transition-colors cursor-pointer space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {item.name}
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {item.provenance.referencePeriod}
              </span>
            </div>
            <div className="font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-100">
              {item.status === 'not_applicable'
                ? 'N/A'
                : formatIndicatorValue(item.value, item.unit)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
              {item.limitationNote ?? item.tenPointExplanation.significado}
            </div>
            <div className="text-[11px] text-teal-700 dark:text-teal-400 font-medium">
              Ver diagnóstico 10 pontos →
            </div>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* 5-Year Recharts Time-Series Panel (ROE, Margem Líquida, Dívida Líquida/EBITDA) */}
      <KeyIndicatorsChart analysis={analysis} onSelectIndicator={onSelectIndicator} />

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

      {/* Content */}
      {subTab === 'bp' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-2">
              Auditoria Contábil Automática (Ativo = Passivo + Patrimônio Líquido)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {fin.accountingIdentityChecks.map((chk) => (
                <div
                  key={chk.period}
                  className={`border rounded-lg p-2.5 text-xs ${
                    chk.valid
                      ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20'
                      : 'border-rose-300 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/30'
                  }`}
                >
                  <div className="font-mono font-semibold">{chk.period}</div>
                  <div className="mt-0.5">{chk.valid ? 'Fechado (OK)' : 'Divergente'}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Conta Patrimonial (R$ mi)</th>
                  {asset.balanceSheets.map((bs) => (
                    <th key={bs.period} className="text-right px-3 py-3 font-mono">
                      {bs.period}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {[
                  { label: 'Caixa e Aplicações', get: (b: (typeof asset.balanceSheets)[0]) => (b.caixaEquivalentes ?? 0) + (b.aplicacoesFinanceiras ?? 0) },
                  { label: 'Contas a Receber', get: (b: (typeof asset.balanceSheets)[0]) => b.contasReceber },
                  { label: 'Estoques', get: (b: (typeof asset.balanceSheets)[0]) => b.estoques },
                  { label: 'Ativo Circulante', get: (b: (typeof asset.balanceSheets)[0]) => b.ativoCirculante },
                  { label: 'Imobilizado + Intangível', get: (b: (typeof asset.balanceSheets)[0]) => (b.imobilizado ?? 0) + (b.intangivel ?? 0) },
                  { label: 'Ativo Total', get: (b: (typeof asset.balanceSheets)[0]) => b.ativoTotal, bold: true },
                  { label: 'Passivo Circulante', get: (b: (typeof asset.balanceSheets)[0]) => b.passivoCirculante },
                  { label: 'Passivo Não Circulante', get: (b: (typeof asset.balanceSheets)[0]) => b.passivoNaoCirculante },
                  { label: 'Dívida Bruta (CP+LP+Deb)', get: (b: (typeof asset.balanceSheets)[0]) => (b.emprestimosCurtoPrazo ?? 0) + (b.emprestimosLongoPrazo ?? 0) + (b.debentures ?? 0) },
                  { label: 'Patrimônio Líquido Total', get: (b: (typeof asset.balanceSheets)[0]) => b.patrimonioLiquidoTotal, bold: true },
                ].map((row) => (
                  <tr key={row.label} className={row.bold ? 'font-semibold bg-slate-50/50 dark:bg-slate-950/30' : ''}>
                    <td className="px-4 py-2.5">{row.label}</td>
                    {asset.balanceSheets.map((bs) => (
                      <td key={bs.period} className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {formatCurrencyBrlM(row.get(bs))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'dre' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Demonstração do Resultado (R$ mi)</th>
                {asset.incomeStatements.map((d) => (
                  <th key={d.period} className="text-right px-3 py-3 font-mono">
                    {d.period}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {[
                { label: 'Receita Líquida / Receita Bancária', get: (d: (typeof asset.incomeStatements)[0]) => d.receitaLiquida, bold: true },
                { label: 'Custos / Provisões', get: (d: (typeof asset.incomeStatements)[0]) => d.custos },
                { label: 'Lucro Bruto', get: (d: (typeof asset.incomeStatements)[0]) => d.lucroBruto },
                { label: 'Despesas Operacionais (Com.+Adm.)', get: (d: (typeof asset.incomeStatements)[0]) => (d.despesasComerciais ?? 0) + (d.despesasAdministrativas ?? 0) },
                { label: 'D&A (Depreciação e Amortização)', get: (d: (typeof asset.incomeStatements)[0]) => d.depreciacaoAmortizacao },
                { label: 'EBITDA', get: (d: (typeof asset.incomeStatements)[0]) => d.ebitda },
                { label: 'EBIT (Resultado Operacional)', get: (d: (typeof asset.incomeStatements)[0]) => d.ebit, bold: true },
                { label: 'Resultado Financeiro Líquido', get: (d: (typeof asset.incomeStatements)[0]) => d.resultadoFinanceiro },
                { label: 'LAIR', get: (d: (typeof asset.incomeStatements)[0]) => d.lair },
                { label: 'IR / CSLL', get: (d: (typeof asset.incomeStatements)[0]) => d.irCsll },
                { label: 'Lucro Líquido Controladores', get: (d: (typeof asset.incomeStatements)[0]) => d.lucroLiquidoControladores, bold: true },
              ].map((row) => (
                <tr key={row.label} className={row.bold ? 'font-semibold bg-slate-50/50 dark:bg-slate-950/30' : ''}>
                  <td className="px-4 py-2.5">{row.label}</td>
                  {asset.incomeStatements.map((d) => (
                    <td key={d.period} className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatCurrencyBrlM(row.get(d))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'dfc' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Demonstração de Fluxo de Caixa (R$ mi)</th>
                {asset.cashFlows.map((c) => (
                  <th key={c.period} className="text-right px-3 py-3 font-mono">
                    {c.period}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {[
                { label: 'Lucro Líquido Base', get: (c: (typeof asset.cashFlows)[0]) => c.lucroLiquidoBase },
                { label: 'D&A na DFC', get: (c: (typeof asset.cashFlows)[0]) => c.depreciacaoAmortizacaoDFC },
                { label: 'Variação Capital de Giro', get: (c: (typeof asset.cashFlows)[0]) => c.variacaoCapitalGiro },
                { label: 'Fluxo de Caixa Operacional (FCO)', get: (c: (typeof asset.cashFlows)[0]) => c.fluxoCaixaOperacional, bold: true },
                { label: 'CAPEX (Aquisição Imob./Intang.)', get: (c: (typeof asset.cashFlows)[0]) => c.aquisicaoImobilizadoCapex },
                { label: 'Fluxo de Caixa de Investimento (FCI)', get: (c: (typeof asset.cashFlows)[0]) => c.fluxoCaixaInvestimento },
                { label: 'Dividendos & JCP Pagos', get: (c: (typeof asset.cashFlows)[0]) => c.dividendosJcpPagos },
                { label: 'Fluxo de Caixa de Financiamento (FCF)', get: (c: (typeof asset.cashFlows)[0]) => c.fluxoCaixaFinanciamento },
              ].map((row) => (
                <tr key={row.label} className={row.bold ? 'font-semibold bg-slate-50/50 dark:bg-slate-950/30' : ''}>
                  <td className="px-4 py-2.5">{row.label}</td>
                  {asset.cashFlows.map((c) => (
                    <td key={c.period} className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatCurrencyBrlM(row.get(c))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'liquidez' && renderCategoryIndicators('liquidez')}
      {subTab === 'endividamento' && (
        <div className="space-y-4">
          {renderCategoryIndicators('endividamento')}
          {renderCategoryIndicators('setorial')}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs space-y-2">
            <h4 className="font-semibold">Perfil & Cronograma da Dívida</h4>
            <p className="text-slate-600 dark:text-slate-300">
              Custo médio: {asset.debtProfile.custoMedioDividaPct ?? 'N/D'}% · CDI:{' '}
              {asset.debtProfile.exposicaoCdiPct ?? 'N/D'}% · IPCA:{' '}
              {asset.debtProfile.exposicaoIpcaPct ?? 'N/D'}% · Câmbio:{' '}
              {asset.debtProfile.exposicaoCambialPct ?? 'N/D'}% ·{' '}
              {asset.debtProfile.covenantsDescricao}
            </p>
            {asset.debtProfile.cronogramaVencimentos.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {asset.debtProfile.cronogramaVencimentos.map((v) => (
                  <span
                    key={v.ano}
                    className="font-mono border border-slate-200 dark:border-slate-800 rounded px-2.5 py-1"
                  >
                    {v.ano}: R$ {v.valor.toFixed(0)} mi
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {subTab === 'rentabilidade' && renderCategoryIndicators('rentabilidade')}
      {subTab === 'eficiencia' && renderCategoryIndicators('eficiencia')}
      {subTab === 'crescimento' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Métrica (CAGR Composto)</th>
                  <th className="text-right px-3 py-3">1 ano</th>
                  <th className="text-right px-3 py-3">3 anos</th>
                  <th className="text-right px-3 py-3">5 anos</th>
                  <th className="text-right px-3 py-3">10 anos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {fin.growthCagrs.map((g) => (
                  <tr key={g.metric}>
                    <td className="px-4 py-2.5 font-medium">
                      {g.metric}
                      {g.note && (
                        <div className="text-[11px] text-slate-500 font-normal">{g.note}</div>
                      )}
                    </td>
                    {[g.cagr1y, g.cagr3y, g.cagr5y, g.cagr10y].map((val, idx) => (
                      <td key={idx} className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {val !== null ? `${val >= 0 ? '+' : ''}${val.toFixed(1)}%` : 'N/D'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {renderCategoryIndicators('crescimento')}
        </div>
      )}
      {subTab === 'geracao_caixa' && renderCategoryIndicators('geracao_caixa')}
      {subTab === 'qualidade_lucros' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">
                  Auditoria de Qualidade dos Lucros & Accruals
                </h3>
                <p className="text-xs text-slate-500">{fin.earningsQuality.methodologyNote}</p>
              </div>
              <div className="font-mono text-sm font-bold px-3 py-1 rounded border border-slate-200 dark:border-slate-700">
                {fin.earningsQuality.classification} ({fin.earningsQuality.score ?? 'N/D'}/100)
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                <div className="text-slate-500">FCO / Lucro Líquido</div>
                <div className="font-mono text-base font-bold mt-1">
                  {fin.earningsQuality.fcoToNetIncomeRatio !== null
                    ? `${fin.earningsQuality.fcoToNetIncomeRatio.toFixed(2)}x`
                    : 'N/D'}
                </div>
              </div>
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                <div className="text-slate-500">Accruals / Ativos</div>
                <div className="font-mono text-base font-bold mt-1">
                  {fin.earningsQuality.accrualsRatioPct !== null
                    ? `${fin.earningsQuality.accrualsRatioPct.toFixed(2)}%`
                    : 'N/D'}
                </div>
              </div>
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                <div className="text-slate-500">Não Recorrentes / LL</div>
                <div className="font-mono text-base font-bold mt-1">
                  {fin.earningsQuality.nonRecurringSharePct !== null
                    ? `${fin.earningsQuality.nonRecurringSharePct.toFixed(1)}%`
                    : 'N/D'}
                </div>
              </div>
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                <div className="text-slate-500">Beneish M-Score</div>
                <div className="font-mono text-base font-bold mt-1">
                  {fin.earningsQuality.beneishMScore.calculable &&
                  fin.earningsQuality.beneishMScore.score !== null
                    ? fin.earningsQuality.beneishMScore.score.toFixed(2)
                    : 'Não calculável'}
                </div>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 text-xs space-y-1">
              <div className="font-semibold">Interpretação Beneish M-Score</div>
              <p className="text-slate-600 dark:text-slate-300">
                {fin.earningsQuality.beneishMScore.interpretation}
              </p>
              <p className="text-slate-500">{fin.earningsQuality.beneishMScore.limitation}</p>
              {fin.earningsQuality.beneishMScore.missingVariables.length > 0 && (
                <p className="text-amber-600 dark:text-amber-400">
                  Variáveis ausentes: {fin.earningsQuality.beneishMScore.missingVariables.join(', ')}
                </p>
              )}
            </div>
          </div>
          {renderCategoryIndicators('qualidade_lucros')}
        </div>
      )}
      {subTab === 'mercado' && renderCategoryIndicators('mercado')}
      {subTab === 'historico' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <h4 className="text-xs font-semibold mb-3">Receita Líquida & Lucro Líquido (R$ mi)</h4>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={fin.historicalSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="receitaLiquida" name="Receita" fill="#0f766e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="lucroLiquido" name="Lucro Líq." fill="#0284c7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <h4 className="text-xs font-semibold mb-3">ROE, ROIC & Margem Líquida (%)</h4>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={fin.historicalSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="roePct" name="ROE %" stroke="#0f766e" strokeWidth={2} />
                    <Line type="monotone" dataKey="roicPct" name="ROIC %" stroke="#f59e0b" strokeWidth={2} />
                    <Line type="monotone" dataKey="margemLiquidaPct" name="Mg. Líq %" stroke="#6366f1" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="text-left px-3 py-2.5">Período</th>
                  <th className="text-right px-3 py-2.5">Receita</th>
                  <th className="text-right px-3 py-2.5">EBITDA</th>
                  <th className="text-right px-3 py-2.5">Lucro Líq.</th>
                  <th className="text-right px-3 py-2.5">ROE %</th>
                  <th className="text-right px-3 py-2.5">Mg. Líq. %</th>
                  <th className="text-right px-3 py-2.5">ROIC %</th>
                  <th className="text-right px-3 py-2.5">Dív. Líq./EBITDA</th>
                  <th className="text-right px-3 py-2.5">FCFF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                {fin.historicalSeries.map((r) => {
                  const dlEbitda =
                    fin.indicators.divida_liquida_ebitda?.status === 'not_applicable'
                      ? 'N/A'
                      : r.dividaLiquida !== null && r.ebitda !== null && r.ebitda > 0
                        ? `${(r.dividaLiquida / r.ebitda).toFixed(2)}x`
                        : 'Indisp.';
                  return (
                    <tr key={r.period}>
                      <td className="px-3 py-2 font-semibold">{r.period}</td>
                      <td className="px-3 py-2 text-right">{formatCurrencyBrlM(r.receitaLiquida)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrencyBrlM(r.ebitda)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrencyBrlM(r.lucroLiquido)}</td>
                      <td className="px-3 py-2 text-right">{r.roePct !== null ? `${r.roePct.toFixed(1)}%` : 'N/A'}</td>
                      <td className="px-3 py-2 text-right">{r.margemLiquidaPct !== null ? `${r.margemLiquidaPct.toFixed(1)}%` : 'N/A'}</td>
                      <td className="px-3 py-2 text-right">{r.roicPct !== null ? `${r.roicPct.toFixed(1)}%` : 'N/A'}</td>
                      <td className="px-3 py-2 text-right">{dlEbitda}</td>
                      <td className="px-3 py-2 text-right">{formatCurrencyBrlM(r.fcff)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
