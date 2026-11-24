import { jsPDF } from 'jspdf';
import { formatIndicatorValue } from '../engine/financial/mathUtils.ts';
import { IntegratedAssetAnalysis } from '../engine/integrated/integratedEngine.ts';

export type PdfReportType = 'resumido' | 'completo' | 'tecnico' | 'comparativo' | 'valuation';

interface PdfContext {
  doc: jsPDF;
  y: number;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  title: string;
}

function ensureSpace(ctx: PdfContext, needed = 18) {
  if (ctx.y + needed > ctx.pageHeight - 18) {
    ctx.doc.addPage();
    ctx.y = 18;
  }
}

function addHeading(ctx: PdfContext, text: string, level: 1 | 2 = 1) {
  ensureSpace(ctx, level === 1 ? 16 : 12);
  ctx.doc.setFont('helvetica', 'bold');
  ctx.doc.setFontSize(level === 1 ? 13 : 10.5);
  ctx.doc.setTextColor(15, 23, 42);
  ctx.doc.text(text, ctx.margin, ctx.y);
  ctx.y += level === 1 ? 6.5 : 5;
  if (level === 1) {
    ctx.doc.setDrawColor(203, 213, 225);
    ctx.doc.line(ctx.margin, ctx.y - 3, ctx.pageWidth - ctx.margin, ctx.y - 3);
  }
}

function addParagraph(ctx: PdfContext, text: string, boldPrefix?: string) {
  ctx.doc.setFontSize(9.2);
  ctx.doc.setTextColor(51, 65, 85);
  const fullText = boldPrefix ? `${boldPrefix}: ${text}` : text;
  const maxWidth = ctx.pageWidth - ctx.margin * 2;
  const lines = ctx.doc.splitTextToSize(fullText, maxWidth) as string[];
  for (const line of lines) {
    ensureSpace(ctx, 5.2);
    ctx.doc.setFont('helvetica', 'normal');
    ctx.doc.text(line, ctx.margin, ctx.y);
    ctx.y += 4.6;
  }
  ctx.y += 1.5;
}

function addKeyValueRow(ctx: PdfContext, col1: string, col2: string, col3 = '', col4 = '') {
  ensureSpace(ctx, 6);
  ctx.doc.setFont('helvetica', 'normal');
  ctx.doc.setFontSize(8.8);
  ctx.doc.setTextColor(30, 41, 59);
  const usable = ctx.pageWidth - ctx.margin * 2;
  ctx.doc.text(col1.slice(0, 42), ctx.margin, ctx.y);
  ctx.doc.text(col2.slice(0, 26), ctx.margin + usable * 0.44, ctx.y);
  if (col3) ctx.doc.text(col3.slice(0, 24), ctx.margin + usable * 0.68, ctx.y);
  if (col4) ctx.doc.text(col4.slice(0, 20), ctx.margin + usable * 0.85, ctx.y);
  ctx.y += 4.8;
}

function finalizeFooters(ctx: PdfContext, orgName: string) {
  const totalPages = ctx.doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    ctx.doc.setPage(i);
    ctx.doc.setFont('helvetica', 'normal');
    ctx.doc.setFontSize(7.5);
    ctx.doc.setTextColor(100, 116, 139);
    ctx.doc.text(
      `Ápice Research · ${orgName} · Relatório informativo sem recomendação personalizada (CVM)`,
      ctx.margin,
      ctx.pageHeight - 8
    );
    ctx.doc.text(`Página ${i} de ${totalPages}`, ctx.pageWidth - ctx.margin - 22, ctx.pageHeight - 8);
  }
}

export function exportAssetPdfReport(
  analysis: IntegratedAssetAnalysis,
  reportType: Exclude<PdfReportType, 'comparativo'>,
  options?: { orgName?: string; aiExecutiveText?: string; analystNotes?: string }
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const orgName = options?.orgName || 'Escritório Institucional';
  const ctx: PdfContext = {
    doc,
    y: 22,
    pageWidth: doc.internal.pageSize.getWidth(),
    pageHeight: doc.internal.pageSize.getHeight(),
    margin: 15,
    title: `${analysis.asset.ticker} — ${analysis.asset.name}`,
  };

  // Cover banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, ctx.pageWidth, 42, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(`ÁPICE RESEARCH · RELATÓRIO ${reportType.toUpperCase()}`, ctx.margin, 16);
  doc.setFontSize(12);
  doc.text(`${analysis.asset.ticker} — ${analysis.asset.name}`, ctx.margin, 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Setor: ${analysis.sectorName} | Segmento: ${analysis.asset.segment} | Ref.: ${analysis.financial.referencePeriod} | Gerado em: ${new Date().toLocaleDateString('pt-BR')}`,
    ctx.margin,
    34
  );

  ctx.y = 52;

  // 1. Resumo Executivo & Scores
  addHeading(ctx, '1. Resumo Executivo & Pontuação 3 Pilares');
  addKeyValueRow(ctx, 'Cotação Atual / Market Cap', `R$ ${analysis.valuation.currentPrice.toFixed(2)}`, `R$ ${(analysis.valuation.marketCapBrlM / 1000).toFixed(2)} bi`, analysis.asset.market.priceDate);
  addKeyValueRow(ctx, 'Nota Pilar 1 — Financeiro', `${analysis.scores.financial.pillarScore}/100`, `Cobertura: ${analysis.scores.financial.dataCoveragePct}%`);
  addKeyValueRow(ctx, 'Nota Pilar 2 — Qualitativo', `${analysis.scores.qualitative.pillarScore}/100`, `Moat: ${analysis.qualitative.moatStrengthOverall.replace(/_/g, ' ')}`);
  addKeyValueRow(ctx, 'Nota Pilar 3 — Valuation', `${analysis.scores.valuation.pillarScore}/100`, `Confiança: ${analysis.valuation.confidenceLevel}`);
  addKeyValueRow(ctx, 'Nota Geral Integrada', `${analysis.scores.overallScore}/100`, `Justo: R$ ${analysis.valuation.reconciledFairValue.toFixed(2)}`, `MoS: ${analysis.valuation.marginOfSafetyPct.toFixed(1)}%`);
  ctx.y += 2;

  // 2. Diagnóstico Estruturado A-H
  addHeading(ctx, '2. Conclusão Integrada (Padrão Analítico A–H)');
  const ah = analysis.structuredConclusion;
  addParagraph(ctx, ah.fatoObservado, 'A) Fato observado');
  addParagraph(ctx, ah.evidencia, 'B) Evidência');
  addParagraph(ctx, ah.interpretacao, 'C) Interpretação');
  addParagraph(ctx, ah.contexto, 'D) Contexto');
  addParagraph(ctx, ah.impacto, 'E) Impacto');
  addParagraph(ctx, ah.risco, 'F) Risco');
  addParagraph(ctx, ah.perspectiva, 'G) Perspectiva');
  addParagraph(ctx, ah.conclusao, 'H) Conclusão');

  if (reportType !== 'valuation') {
    addHeading(ctx, '3. Pilar 1 — Análise Financeira & Indicadores-Chave');
    addParagraph(ctx, analysis.financial.overallDiagnosis);
    const indicators = Object.values(analysis.financial.indicators).filter((i) => i.status !== 'not_applicable');
    for (const ind of indicators.slice(0, reportType === 'resumido' ? 12 : 28)) {
      const vStr = ind.value !== null ? formatIndicatorValue(ind.value, ind.unit) : 'Indisponível';
      addKeyValueRow(ctx, ind.name, vStr, ind.trend.replace(/_/g, ' '), ind.provenance.referencePeriod);
    }

    if (reportType === 'completo' || reportType === 'tecnico') {
      addHeading(ctx, '4. Qualidade dos Lucros, Accruals & Beneish M-Score');
      addParagraph(
        ctx,
        `Classificação: ${analysis.financial.earningsQuality.classification} (${analysis.financial.earningsQuality.score ?? 'N/D'}/100). FCO/LL: ${analysis.financial.earningsQuality.fcoToNetIncomeRatio?.toFixed(2) ?? 'N/D'}x. ${analysis.financial.earningsQuality.beneishMScore.interpretation}`
      );
      if (analysis.financial.earningsQuality.signalsToInvestigate.length > 0) {
        for (const sig of analysis.financial.earningsQuality.signalsToInvestigate) {
          addParagraph(ctx, sig, 'Sinal a investigar');
        }
      }
    }
  }

  if (reportType === 'completo' || reportType === 'resumido') {
    addHeading(ctx, reportType === 'resumido' ? '4. Pilar 2 — Vantagens Competitivas & Governança' : '5. Pilar 2 — Modelo de Negócio, Moat & Governança');
    addParagraph(ctx, analysis.asset.qualitative.businessModel.objectiveDescription, 'Modelo de Negócio');
    addParagraph(ctx, `Força do moat: ${analysis.qualitative.moatStrengthOverall.replace(/_/g, ' ')} (${analysis.qualitative.moatCountStrong} dimensão(ões) forte(s)). Governança: ${analysis.asset.qualitative.governance.listingSegment} | Tag Along ${analysis.asset.qualitative.governance.tagAlongPct ?? 'N/D'}%.`, 'Moat & Governança');
    if (reportType === 'completo') {
      addParagraph(ctx, analysis.asset.qualitative.capitalAllocation.incrementalRoicVsWaccNote, 'Alocação de Capital');
      addParagraph(ctx, analysis.asset.qualitative.esg.independentAssessment.summary, 'ESG Independente');
    }
  }

  if (reportType !== 'tecnico' || true) {
    addHeading(ctx, '6. Pilar 3 — Valuation, CAPM/WACC, Cenários & Reconciliação');
    addKeyValueRow(ctx, 'Ke (CAPM) / WACC', `${analysis.valuation.kePct.toFixed(2)}% / ${analysis.valuation.waccPct.toFixed(2)}%`, `Beta: ${analysis.valuation.assumptionsUsed.beta.toFixed(2)}`, `g: ${analysis.valuation.scenarios.base.terminalGrowthPct.toFixed(2)}%`);
    addKeyValueRow(ctx, 'Cenário Conservador', `R$ ${analysis.valuation.scenarios.conservador.fairValuePerShare.toFixed(2)}`, `CAGR: ${analysis.valuation.scenarios.conservador.revenueCagrPct.toFixed(1)}%`);
    addKeyValueRow(ctx, 'Cenário Base', `R$ ${analysis.valuation.scenarios.base.fairValuePerShare.toFixed(2)}`, `CAGR: ${analysis.valuation.scenarios.base.revenueCagrPct.toFixed(1)}%`);
    addKeyValueRow(ctx, 'Cenário Otimista', `R$ ${analysis.valuation.scenarios.otimista.fairValuePerShare.toFixed(2)}`, `CAGR: ${analysis.valuation.scenarios.otimista.revenueCagrPct.toFixed(1)}%`);
    ctx.y += 2;
    for (const m of analysis.valuation.modelsTable) {
      addKeyValueRow(
        ctx,
        m.label,
        m.applicable && m.fairValuePerShare !== null ? `R$ ${m.fairValuePerShare.toFixed(2)}` : 'N/A',
        `Peso: ${(m.weight * 100).toFixed(0)}%`,
        m.applicable ? 'Aplicável' : 'Excluído'
      );
    }
    if (analysis.valuation.reverseDcf.applicable) {
      addParagraph(ctx, analysis.valuation.reverseDcf.explanation, 'Reverse DCF');
    }
  }

  addHeading(ctx, '7. Matriz de Alertas, Riscos & Lacunas Informacionais');
  if (analysis.alerts.length === 0) {
    addParagraph(ctx, 'Nenhum alerta crítico de deterioração detectado no período de referência.');
  } else {
    for (const al of analysis.alerts) {
      addParagraph(ctx, `[${al.severity.toUpperCase()}] ${al.relatedIndicator}: ${al.evidence} ${al.investigationRecommendation}`);
    }
  }

  if (options?.analystNotes?.trim()) {
    addHeading(ctx, '8. Notas & Tese do Analista Responsável');
    addParagraph(ctx, options.analystNotes.trim());
  }

  if (options?.aiExecutiveText?.trim()) {
    addHeading(ctx, '9. Síntese Assistida por IA (Baseada nos Dados Determinísticos)');
    addParagraph(ctx, options.aiExecutiveText.trim());
  }

  addHeading(ctx, '10. Fontes, Proveniência & Limitações Metodológicas');
  for (const src of analysis.asset.sources.slice(0, 6)) {
    addParagraph(ctx, `${src.source} (${src.referencePeriod}) — ${src.methodology}`);
  }
  addParagraph(
    ctx,
    'Este documento consolida dados históricos e premissas parametrizadas sem garantia de retorno futuro. Indicadores marcados como N/A ou Indisponível não são convertidos em zero no cálculo de notas.'
  );

  finalizeFooters(ctx, orgName);
  doc.save(`apice_${reportType}_${analysis.asset.ticker}.pdf`);
}

export function exportComparisonPdfReport(
  analyses: IntegratedAssetAnalysis[],
  orgName = 'Escritório Institucional'
) {
  if (analyses.length < 2) return;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const ctx: PdfContext = {
    doc,
    y: 22,
    pageWidth: doc.internal.pageSize.getWidth(),
    pageHeight: doc.internal.pageSize.getHeight(),
    margin: 14,
    title: 'Comparativo Multi-Ativos',
  };

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, ctx.pageWidth, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(`ÁPICE RESEARCH · RELATÓRIO COMPARATIVO (${analyses.map((a) => a.asset.ticker).join(' vs ')})`, ctx.margin, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(`Organização: ${orgName} | Data de emissão: ${new Date().toLocaleDateString('pt-BR')}`, ctx.margin, 25);

  ctx.y = 44;
  addHeading(ctx, 'Matriz Comparativa Consolidada (3 Pilares)');

  const rows: Array<{ label: string; values: string[] }> = [
    { label: 'Setor B3', values: analyses.map((a) => a.sectorName) },
    { label: 'Preço / Valor Justo', values: analyses.map((a) => `R$ ${a.valuation.currentPrice.toFixed(2)} / R$ ${a.valuation.reconciledFairValue.toFixed(2)}`) },
    { label: 'Margem de Segurança', values: analyses.map((a) => `${a.valuation.marginOfSafetyPct.toFixed(1)}%`) },
    { label: 'Financeiro / Qualitativo / Valuation', values: analyses.map((a) => `${a.scores.financial.pillarScore} / ${a.scores.qualitative.pillarScore} / ${a.scores.valuation.pillarScore}`) },
    { label: 'Nota Geral / Cobertura', values: analyses.map((a) => `${a.scores.overallScore}/100 (${a.scores.overallDataCoveragePct}%)`) },
    { label: 'ROE / ROIC', values: analyses.map((a) => `${formatIndicatorValue(a.financial.indicators.roe?.value ?? null, '%')} / ${a.financial.indicators.roic?.status === 'not_applicable' ? 'N/A' : formatIndicatorValue(a.financial.indicators.roic?.value ?? null, '%')}`) },
    { label: 'P/L / P/VP / DY', values: analyses.map((a) => `${formatIndicatorValue(a.financial.indicators.pl?.value ?? null, 'x')} / ${formatIndicatorValue(a.financial.indicators.pvp?.value ?? null, 'x')} / ${formatIndicatorValue(a.financial.indicators.dividend_yield?.value ?? null, '%')}`) },
    { label: 'Alertas Críticos/Altos', values: analyses.map((a) => `${a.alerts.filter((al) => al.severity === 'critico' || al.severity === 'alto_risco').length} alerta(s)`) },
  ];

  const usable = ctx.pageWidth - ctx.margin * 2;
  const labelW = usable * 0.26;
  const colW = (usable - labelW) / analyses.length;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('Métrica', ctx.margin, ctx.y);
  analyses.forEach((a, idx) => {
    doc.text(a.asset.ticker, ctx.margin + labelW + idx * colW, ctx.y);
  });
  ctx.y += 6;

  for (const row of rows) {
    ensureSpace(ctx, 7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(row.label.slice(0, 32), ctx.margin, ctx.y);
    doc.setFont('helvetica', 'normal');
    row.values.forEach((v, idx) => {
      doc.text(v.slice(0, 30), ctx.margin + labelW + idx * colW, ctx.y);
    });
    ctx.y += 5.5;
  }

  ctx.y += 4;
  addHeading(ctx, 'Síntese por Ativo');
  for (const a of analyses) {
    addParagraph(ctx, a.recommendationSummary, `${a.asset.ticker} (Geral ${a.scores.overallScore}/100)`);
  }

  finalizeFooters(ctx, orgName);
  doc.save(`apice_comparativo_${analyses.map((a) => a.asset.ticker).join('_')}.pdf`);
}
