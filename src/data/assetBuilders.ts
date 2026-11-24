import {
  BalanceSheetPeriod,
  CashFlowPeriod,
  IncomeStatementPeriod,
  QualitativeProfile,
} from '../engine/types.ts';

export function makeBalanceSheet(p: {
  period: string;
  disclosureDate: string;
  caixa: number;
  aplicacoes?: number;
  recebiveis: number;
  estoques: number | null;
  tributos?: number;
  outrosAC?: number;
  rlp?: number;
  investimentos?: number;
  imobilizado: number;
  intangivel: number;
  agio?: number;
  fornecedores: number;
  divCP: number;
  trabTribCP?: number;
  dividendosPagar?: number;
  outrosCP?: number;
  divLP: number;
  debentures?: number;
  provisoes?: number;
  outrosLP?: number;
  capitalSocial: number;
  reservas: number;
  naoControladores?: number;
}): BalanceSheetPeriod {
  const aplicacoes = p.aplicacoes ?? 0;
  const tributos = p.tributos ?? 0;
  const outrosAC = p.outrosAC ?? 0;
  const ativoCirculante = p.caixa + aplicacoes + p.recebiveis + (p.estoques ?? 0) + tributos + outrosAC;

  const rlp = p.rlp ?? 0;
  const investimentos = p.investimentos ?? 0;
  const agio = p.agio ?? 0;
  const ativoNaoCirculante = rlp + investimentos + p.imobilizado + p.intangivel;
  const ativoTotal = ativoCirculante + ativoNaoCirculante;

  const trabTribCP = p.trabTribCP ?? 0;
  const dividendosPagar = p.dividendosPagar ?? 0;
  const outrosCP = p.outrosCP ?? 0;
  const passivoCirculante = p.fornecedores + p.divCP + trabTribCP + dividendosPagar + outrosCP;

  const debentures = p.debentures ?? 0;
  const provisoes = p.provisoes ?? 0;
  const outrosLP = p.outrosLP ?? 0;
  const passivoNaoCirculante = p.divLP + debentures + provisoes + outrosLP;

  const naoControladores = p.naoControladores ?? 0;
  const plTotal = ativoTotal - passivoCirculante - passivoNaoCirculante;
  const plControladores = plTotal - naoControladores;

  return {
    period: p.period,
    granularity: p.period.includes('LTM') ? 'ltm' : 'annual',
    disclosureDate: p.disclosureDate,
    consolidated: true,
    caixaEquivalentes: p.caixa,
    aplicacoesFinanceiras: aplicacoes,
    contasReceber: p.recebiveis,
    estoques: p.estoques,
    tributosRecuperar: tributos,
    despesasAntecipadas: 0,
    outrosAtivosCirculantes: outrosAC,
    ativoCirculante,
    realizavelLongoPrazo: rlp,
    investimentos,
    imobilizado: p.imobilizado,
    intangivel: p.intangivel,
    agio,
    ativoNaoCirculante,
    ativoTotal,
    fornecedores: p.fornecedores,
    emprestimosCurtoPrazo: p.divCP,
    obrigacoesTrabalhistas: trabTribCP * 0.5,
    obrigacoesTributarias: trabTribCP * 0.5,
    dividendosPagar,
    outrasObrigacoesCP: outrosCP,
    passivoCirculante,
    emprestimosLongoPrazo: p.divLP,
    debentures,
    provisoes,
    obrigacoesFiscaisLP: outrosLP * 0.3,
    outrosPassivosLP: outrosLP * 0.7,
    passivoNaoCirculante,
    capitalSocial: p.capitalSocial,
    reservasCapital: p.reservas * 0.15,
    reservasLucros: plControladores - p.capitalSocial - p.reservas * 0.15,
    lucrosPrejuizosAcumulados: 0,
    ajustesAvaliacaoPatrimonial: 0,
    participacaoNaoControladores: naoControladores,
    patrimonioLiquidoControladores: plControladores,
    patrimonioLiquidoTotal: plTotal,
  };
}

export function makeDre(p: {
  period: string;
  disclosureDate: string;
  receitaLiquida: number;
  custos: number;
  comerciais: number;
  administrativas: number;
  outrasOp?: number;
  da: number;
  recFin?: number;
  despJuros: number;
  irCsll: number;
  naoControladores?: number;
  naoRecorrentes?: number;
}): IncomeStatementPeriod {
  const receitaBruta = p.receitaLiquida * 1.14;
  const deducoesReceita = -(receitaBruta - p.receitaLiquida);
  const lucroBruto = p.receitaLiquida - Math.abs(p.custos);
  const outrasOp = p.outrasOp ?? 0;
  const ebit = lucroBruto - Math.abs(p.comerciais) - Math.abs(p.administrativas) + outrasOp;
  const ebitda = ebit + Math.abs(p.da);
  const recFin = p.recFin ?? 0;
  const resultadoFinanceiro = recFin - Math.abs(p.despJuros);
  const lair = ebit + resultadoFinanceiro;
  const lucroLiquidoTotal = lair - Math.abs(p.irCsll);
  const nc = p.naoControladores ?? 0;
  return {
    period: p.period,
    granularity: p.period.includes('LTM') ? 'ltm' : 'annual',
    disclosureDate: p.disclosureDate,
    consolidated: true,
    receitaBruta,
    deducoesReceita,
    receitaLiquida: p.receitaLiquida,
    custos: -Math.abs(p.custos),
    lucroBruto,
    despesasComerciais: -Math.abs(p.comerciais),
    despesasAdministrativas: -Math.abs(p.administrativas),
    outrasDespesasReceitasOp: outrasOp,
    depreciacaoAmortizacao: Math.abs(p.da),
    ebitda,
    ebitdaDivulgado: true,
    ebit,
    receitasFinanceiras: recFin,
    despesasFinanceirasJuros: -Math.abs(p.despJuros),
    resultadoFinanceiro,
    lair,
    irCsll: -Math.abs(p.irCsll),
    lucroLiquidoTotal,
    lucroLiquidoControladores: lucroLiquidoTotal - nc,
    lucroLiquidoNaoControladores: nc,
    resultadosNaoRecorrentes: p.naoRecorrentes ?? 0,
  };
}

export function makeDfc(p: {
  period: string;
  disclosureDate: string;
  ll: number;
  da: number;
  varWc: number;
  fco: number;
  capex: number;
  intangivel?: number;
  mAndA?: number;
  captacao?: number;
  amortizacao?: number;
  dividendos: number;
  recompra?: number;
}): CashFlowPeriod {
  const intang = p.intangivel ?? 0;
  const mAndA = p.mAndA ?? 0;
  const fci = -(Math.abs(p.capex) + Math.abs(intang) + Math.abs(mAndA));
  const captacao = p.captacao ?? 0;
  const amortizacao = p.amortizacao ?? 0;
  const recompra = p.recompra ?? 0;
  const fcf = captacao - Math.abs(amortizacao) - Math.abs(p.dividendos) - Math.abs(recompra);

  return {
    period: p.period,
    granularity: p.period.includes('LTM') ? 'ltm' : 'annual',
    disclosureDate: p.disclosureDate,
    lucroLiquidoBase: p.ll,
    depreciacaoAmortizacaoDFC: Math.abs(p.da),
    variacaoCapitalGiro: p.varWc,
    provisoesAjustesSemCaixa: p.fco - p.ll - Math.abs(p.da) - p.varWc,
    fluxoCaixaOperacional: p.fco,
    aquisicaoImobilizadoCapex: -Math.abs(p.capex),
    aquisicaoIntangivel: -Math.abs(intang),
    investimentosLiquidos: 0,
    alienacaoAtivos: 0,
    aquisicoesEmpresas: -Math.abs(mAndA),
    fluxoCaixaInvestimento: fci,
    captacaoEmprestimos: captacao,
    pagamentoDividas: -Math.abs(amortizacao),
    emissaoAcoes: 0,
    recompraAcoes: -Math.abs(recompra),
    dividendosJcpPagos: -Math.abs(p.dividendos),
    jurosPagosFCF: 0,
    fluxoCaixaFinanciamento: fcf,
  };
}

export function makeDefaultPorter(
  rivalry: 'Alta' | 'Média' | 'Baixa',
  newEntrants: 'Alta' | 'Média' | 'Baixa',
  substitutes: 'Alta' | 'Média' | 'Baixa',
  supplierPower: 'Alta' | 'Média' | 'Baixa',
  buyerPower: 'Alta' | 'Média' | 'Baixa',
  notes: { r: string; n: string; s: string; sp: string; bp: string }
): QualitativeProfile['marketAndCompetition']['porterFiveForces'] {
  return {
    rivalry: { level: rivalry, analysis: notes.r },
    newEntrants: { level: newEntrants, analysis: notes.n },
    substitutes: { level: substitutes, analysis: notes.s },
    supplierPower: { level: supplierPower, analysis: notes.sp },
    buyerPower: { level: buyerPower, analysis: notes.bp },
  };
}
