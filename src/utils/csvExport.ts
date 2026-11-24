import { IntegratedAssetAnalysis } from '../engine/integrated/integratedEngine.ts';
import { formatIndicatorValue } from '../engine/financial/mathUtils.ts';

function escapeCsv(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function triggerDownload(filename: string, csvBody: string) {
  const blob = new Blob(['\uFEFF' + csvBody], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportAssetToCsv(analysis: IntegratedAssetAnalysis) {
  const rows: string[] = [];
  rows.push(['Seção', 'Métrica', 'Valor', 'Unidade', 'Status', 'Período Ref.', 'Fonte'].map(escapeCsv).join(';'));

  rows.push(['Resumo', 'Ticker', analysis.asset.ticker, '-', 'divulgado', analysis.financial.referencePeriod, analysis.asset.market.priceSource].map(escapeCsv).join(';'));
  rows.push(['Resumo', 'Nome', analysis.asset.name, '-', 'divulgado', analysis.financial.referencePeriod, '-'].map(escapeCsv).join(';'));
  rows.push(['Resumo', 'Setor', analysis.sectorName, '-', 'calculado', analysis.financial.referencePeriod, '-'].map(escapeCsv).join(';'));
  rows.push(['Scores', 'Nota Financeira (0-100)', analysis.scores.financial.pillarScore, 'pts', 'calculado', analysis.financial.referencePeriod, 'Motor Ápice'].map(escapeCsv).join(';'));
  rows.push(['Scores', 'Nota Qualitativa (0-100)', analysis.scores.qualitative.pillarScore, 'pts', 'calculado', analysis.asset.qualitative.referenceDate, 'Motor Ápice'].map(escapeCsv).join(';'));
  rows.push(['Scores', 'Nota Valuation (0-100)', analysis.scores.valuation.pillarScore, 'pts', 'calculado', analysis.valuation.referenceDate, 'Motor Ápice'].map(escapeCsv).join(';'));
  rows.push(['Scores', 'Nota Geral Integrada (0-100)', analysis.scores.overallScore, 'pts', 'calculado', analysis.financial.referencePeriod, 'Motor Ápice'].map(escapeCsv).join(';'));
  rows.push(['Scores', 'Cobertura de Dados', analysis.scores.overallDataCoveragePct, '%', 'calculado', analysis.financial.referencePeriod, 'Motor Ápice'].map(escapeCsv).join(';'));

  for (const ind of Object.values(analysis.financial.indicators)) {
    rows.push(
      [
        `Pilar 1 (${ind.category})`,
        ind.name,
        ind.value !== null ? formatIndicatorValue(ind.value, ind.unit) : ind.status === 'not_applicable' ? 'N/A' : 'Indisponível',
        ind.unit,
        ind.status,
        ind.provenance.referencePeriod,
        ind.provenance.source,
      ]
        .map(escapeCsv)
        .join(';')
    );
  }

  rows.push(['Pilar 3 Valuation', 'Preço Atual', analysis.valuation.currentPrice.toFixed(2), 'BRL', 'divulgado', analysis.asset.market.priceDate, analysis.asset.market.priceSource].map(escapeCsv).join(';'));
  rows.push(['Pilar 3 Valuation', 'Valor Justo Reconciliado', analysis.valuation.reconciledFairValue.toFixed(2), 'BRL', 'calculado', analysis.valuation.referenceDate, 'Reconciliação Setorial'].map(escapeCsv).join(';'));
  rows.push(['Pilar 3 Valuation', 'Margem de Segurança', analysis.valuation.marginOfSafetyPct.toFixed(1), '%', 'calculado', analysis.valuation.referenceDate, 'Motor Valuation'].map(escapeCsv).join(';'));
  rows.push(['Pilar 3 Valuation', 'Ke (CAPM)', analysis.valuation.kePct.toFixed(2), '%', 'calculado', analysis.valuation.referenceDate, 'CAPM'].map(escapeCsv).join(';'));
  rows.push(['Pilar 3 Valuation', 'WACC', analysis.valuation.waccPct.toFixed(2), '%', 'calculado', analysis.valuation.referenceDate, 'WACC'].map(escapeCsv).join(';'));

  for (const m of analysis.valuation.modelsTable) {
    rows.push(
      [
        'Valuation Modelos',
        m.label,
        m.applicable && m.fairValuePerShare !== null ? m.fairValuePerShare.toFixed(2) : 'N/A',
        'BRL',
        m.applicable ? 'calculado' : 'not_applicable',
        analysis.valuation.referenceDate,
        m.details,
      ]
        .map(escapeCsv)
        .join(';')
    );
  }

  for (const alert of analysis.alerts) {
    rows.push(
      ['Alertas', `[${alert.severity.toUpperCase()}] ${alert.relatedIndicator}`, alert.evidence, '-', alert.pillar, alert.period, alert.explanation]
        .map(escapeCsv)
        .join(';')
    );
  }

  triggerDownload(`apice_research_${analysis.asset.ticker}_${analysis.financial.referencePeriod}.csv`, rows.join('\n'));
}

export function exportComparisonToCsv(analyses: IntegratedAssetAnalysis[]) {
  if (analyses.length === 0) return;
  const header = ['Dimensão / Métrica', ...analyses.map((a) => `${a.asset.ticker} (${a.sectorName})`)];
  const rows: string[] = [header.map(escapeCsv).join(';')];

  const metrics: Array<{ label: string; getter: (a: IntegratedAssetAnalysis) => string }> = [
    { label: 'Preço Atual (R$)', getter: (a) => a.valuation.currentPrice.toFixed(2) },
    { label: 'Market Cap (R$ bi)', getter: (a) => (a.valuation.marketCapBrlM / 1000).toFixed(2) },
    { label: 'Nota Financeira (0-100)', getter: (a) => String(a.scores.financial.pillarScore) },
    { label: 'Nota Qualitativa (0-100)', getter: (a) => String(a.scores.qualitative.pillarScore) },
    { label: 'Nota Valuation (0-100)', getter: (a) => String(a.scores.valuation.pillarScore) },
    { label: 'Nota Geral Integrada', getter: (a) => String(a.scores.overallScore) },
    { label: 'Cobertura de Dados (%)', getter: (a) => `${a.scores.overallDataCoveragePct}%` },
    { label: 'Valor Justo Reconciliado (R$)', getter: (a) => a.valuation.reconciledFairValue.toFixed(2) },
    { label: 'Margem de Segurança (%)', getter: (a) => `${a.valuation.marginOfSafetyPct.toFixed(1)}%` },
    { label: 'ROE (%)', getter: (a) => formatIndicatorValue(a.financial.indicators.roe?.value ?? null, '%') },
    { label: 'ROIC (%)', getter: (a) => a.financial.indicators.roic?.status === 'not_applicable' ? 'N/A' : formatIndicatorValue(a.financial.indicators.roic?.value ?? null, '%') },
    { label: 'P/L (x)', getter: (a) => formatIndicatorValue(a.financial.indicators.pl?.value ?? null, 'x') },
    { label: 'P/VP (x)', getter: (a) => formatIndicatorValue(a.financial.indicators.pvp?.value ?? null, 'x') },
    { label: 'Dividend Yield (%)', getter: (a) => formatIndicatorValue(a.financial.indicators.dividend_yield?.value ?? null, '%') },
    { label: 'Dívida Líquida/EBITDA (x)', getter: (a) => a.financial.indicators.divida_liquida_ebitda?.status === 'not_applicable' ? 'N/A' : formatIndicatorValue(a.financial.indicators.divida_liquida_ebitda?.value ?? null, 'x') },
    { label: 'Força do Moat', getter: (a) => a.qualitative.moatStrengthOverall.replace(/_/g, ' ') },
    { label: 'Alertas Críticos/Alto Risco', getter: (a) => String(a.alerts.filter((al) => al.severity === 'critico' || al.severity === 'alto_risco').length) },
  ];

  for (const m of metrics) {
    rows.push([m.label, ...analyses.map(m.getter)].map(escapeCsv).join(';'));
  }

  const tickersSlug = analyses.map((a) => a.asset.ticker).join('_');
  triggerDownload(`apice_comparativo_${tickersSlug}.csv`, rows.join('\n'));
}
