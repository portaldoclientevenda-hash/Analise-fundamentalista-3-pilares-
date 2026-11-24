import { isFiniteNumber } from '../financial/mathUtils.ts';

export interface ReturnSimulationInput {
  ticker: string;
  quantity: number;
  pricePerShare: number;
  horizonYears: number;
  expectedPriceAppreciationPct: number;
  expectedDividendYieldPct: number;
  reinvestDividends: boolean;
  inflationRatePct: number;
  benchmarkRatePct?: number | null; // e.g. Selic / CDI nominal % a.a.
}

export interface SimulationYearRow {
  year: number;
  shares: number;
  sharePriceNominal: number;
  annualDividendsNominal: number;
  cumulativeDividendsNominal: number;
  nominalTotal: number;
  inflationFactor: number;
  realTotal: number;
  realBenchmarkTotal: number | null;
  realGainPct: number;
}

export interface ReturnSimulationResult {
  ticker: string;
  quantity: number;
  pricePerShare: number;
  horizonYears: number;
  investedCapital: number;
  finalShares: number;
  extraSharesFromDividends: number;
  finalNominalValue: number;
  finalRealValue: number;
  inflationErosionBrl: number;
  cumulativeInflationPct: number;
  nominalTotalReturnPct: number;
  realTotalReturnPct: number;
  nominalAnnualizedPct: number;
  realAnnualizedPct: number;
  finalYearDividendsReal: number;
  realBenchmarkFinal: number | null;
  beatsInflation: boolean;
  rows: SimulationYearRow[];
  whySummary: string;
  directInfluenceNotes: {
    priceAndQuantity: string;
    inflationImpact: string;
    dividendReinvestmentImpact: string;
    sensitivityNote: string;
  };
}

function calcRealAnnualizedFisher(nominalAnnualPct: number, inflationPct: number): number {
  const nom = 1 + nominalAnnualPct / 100;
  const inf = 1 + inflationPct / 100;
  if (inf <= 0) return nominalAnnualPct;
  return (nom / inf - 1) * 100;
}

export function simulateInflationAdjustedReturn(
  input: ReturnSimulationInput
): ReturnSimulationResult {
  const ticker = input.ticker.trim().toUpperCase() || 'ATIVO';
  const quantity = Math.max(1, Math.floor(Number.isFinite(input.quantity) ? input.quantity : 1));
  const pricePerShare = Math.max(
    0.01,
    Number.isFinite(input.pricePerShare) ? input.pricePerShare : 0.01
  );
  const horizonYears = Math.max(
    1,
    Math.min(30, Math.round(Number.isFinite(input.horizonYears) ? input.horizonYears : 5))
  );
  const g = (Number.isFinite(input.expectedPriceAppreciationPct)
    ? input.expectedPriceAppreciationPct
    : 0) / 100;
  const dy = Math.max(
    0,
    (Number.isFinite(input.expectedDividendYieldPct) ? input.expectedDividendYieldPct : 0) / 100
  );
  const inf = Math.max(
    -0.5,
    (Number.isFinite(input.inflationRatePct) ? input.inflationRatePct : 0) / 100
  );
  const benchPct = isFiniteNumber(input.benchmarkRatePct) ? input.benchmarkRatePct / 100 : null;

  const investedCapital = quantity * pricePerShare;

  const rows: SimulationYearRow[] = [
    {
      year: 0,
      shares: quantity,
      sharePriceNominal: pricePerShare,
      annualDividendsNominal: 0,
      cumulativeDividendsNominal: 0,
      nominalTotal: investedCapital,
      inflationFactor: 1,
      realTotal: investedCapital,
      realBenchmarkTotal: benchPct !== null ? investedCapital : null,
      realGainPct: 0,
    },
  ];

  let shares = quantity;
  let cumulativeCashDividends = 0;
  let cumulativeDividendsGenerated = 0;

  for (let year = 1; year <= horizonYears; year++) {
    const sharePriceNominal = Math.max(0.0001, pricePerShare * Math.pow(1 + g, year));
    const annualDividendsNominal = shares * sharePriceNominal * dy;
    cumulativeDividendsGenerated += annualDividendsNominal;

    if (input.reinvestDividends) {
      shares += annualDividendsNominal / sharePriceNominal;
    } else {
      cumulativeCashDividends += annualDividendsNominal;
    }

    const positionValueNominal = shares * sharePriceNominal;
    const nominalTotal = positionValueNominal + cumulativeCashDividends;
    const inflationFactor = Math.pow(1 + inf, year);
    const realTotal = nominalTotal / inflationFactor;
    const realBenchmarkTotal =
      benchPct !== null
        ? (investedCapital * Math.pow(1 + benchPct, year)) / inflationFactor
        : null;
    const realGainPct = ((realTotal / investedCapital) - 1) * 100;

    rows.push({
      year,
      shares,
      sharePriceNominal,
      annualDividendsNominal,
      cumulativeDividendsNominal: cumulativeDividendsGenerated,
      nominalTotal,
      inflationFactor,
      realTotal,
      realBenchmarkTotal,
      realGainPct,
    });
  }

  const last = rows[rows.length - 1];
  const finalNominalValue = last.nominalTotal;
  const finalRealValue = last.realTotal;
  const inflationErosionBrl = finalNominalValue - finalRealValue;
  const cumulativeInflationPct = (last.inflationFactor - 1) * 100;
  const nominalTotalReturnPct = ((finalNominalValue / investedCapital) - 1) * 100;
  const realTotalReturnPct = ((finalRealValue / investedCapital) - 1) * 100;

  const nominalAnnualizedPct =
    finalNominalValue > 0
      ? (Math.pow(finalNominalValue / investedCapital, 1 / horizonYears) - 1) * 100
      : -100;
  const realAnnualizedPct = calcRealAnnualizedFisher(
    nominalAnnualizedPct,
    input.inflationRatePct
  );

  // Calculate counterfactual without dividend reinvestment (or with it) for direct causal comparison
  let sharesNoReinvest = quantity;
  let cashNoReinvest = 0;
  for (let y = 1; y <= horizonYears; y++) {
    const p = Math.max(0.0001, pricePerShare * Math.pow(1 + g, y));
    cashNoReinvest += sharesNoReinvest * p * dy;
  }
  const realNoReinvest =
    (sharesNoReinvest * Math.max(0.0001, pricePerShare * Math.pow(1 + g, horizonYears)) +
      cashNoReinvest) /
    last.inflationFactor;

  // Sensitivity to +2 p.p. inflation
  const higherInfFactor = Math.pow(1 + (input.inflationRatePct + 2) / 100, horizonYears);
  const realAtHigherInflation = finalNominalValue / higherInfFactor;
  const realLossFromExtraInf = finalRealValue - realAtHigherInflation;

  const beatsInflation = finalRealValue >= investedCapital;

  const whySummary = beatsInflation
    ? `Ao comprar ${quantity.toLocaleString('pt-BR')} cotas de ${ticker} a R$ ${pricePerShare.toFixed(2)} (R$ ${investedCapital.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}), o retorno nominal anualizado de ${nominalAnnualizedPct.toFixed(2)}% supera a inflação de ${input.inflationRatePct.toFixed(2)}% a.a., gerando ganho real de poder de compra de +${realTotalReturnPct.toFixed(1)}% (${realAnnualizedPct.toFixed(2)}% a.a. pela Equação de Fisher).`
    : `Nas premissas atuais, a valorização + proventos (${nominalAnnualizedPct.toFixed(2)}% a.a.) fica abaixo da inflação projetada (${input.inflationRatePct.toFixed(2)}% a.a.), resultando em perda real de poder de compra de ${realTotalReturnPct.toFixed(1)}% em ${horizonYears} ano(s).`;

  return {
    ticker,
    quantity,
    pricePerShare,
    horizonYears,
    investedCapital,
    finalShares: last.shares,
    extraSharesFromDividends: Math.max(0, last.shares - quantity),
    finalNominalValue,
    finalRealValue,
    inflationErosionBrl,
    cumulativeInflationPct,
    nominalTotalReturnPct,
    realTotalReturnPct,
    nominalAnnualizedPct,
    realAnnualizedPct,
    finalYearDividendsReal: last.annualDividendsNominal / last.inflationFactor,
    realBenchmarkFinal: last.realBenchmarkTotal,
    beatsInflation,
    rows,
    whySummary,
    directInfluenceNotes: {
      priceAndQuantity: `Aporte inicial de R$ ${investedCapital.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${quantity.toLocaleString('pt-BR')} cotas × R$ ${pricePerShare.toFixed(2)}). Pagar um preço de entrada menor eleva tanto o ganho percentual de valorização quanto a quantidade de cotas compradas com o mesmo capital.`,
      inflationImpact: `Uma inflação de ${input.inflationRatePct.toFixed(2)}% a.a. acumula ${cumulativeInflationPct.toFixed(1)}% em ${horizonYears} ano(s), descontando R$ ${inflationErosionBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} do patrimônio nominal final (R$ ${finalNominalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} nominais equivalem a R$ ${finalRealValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} em moeda de hoje).`,
      dividendReinvestmentImpact: input.reinvestDividends
        ? `Reinvestir o Dividend Yield (${input.expectedDividendYieldPct.toFixed(2)}% a.a.) gera +${Math.max(0, last.shares - quantity).toFixed(1)} cotas extras ao longo do prazo e adiciona R$ ${(finalRealValue - realNoReinvest).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} em poder de compra real frente a manter os proventos parados em caixa.`
        : `Com reinvestimento desativado, suas cotas permanecem fixas em ${quantity.toLocaleString('pt-BR')} e os dividendos em dinheiro sofrem erosão inflacionária direta ano a ano.`,
      sensitivityNote: `Sensibilidade à inflação: se o IPCA médio subir +2,0 p.p. ao ano (para ${(input.inflationRatePct + 2).toFixed(2)}% a.a.), o patrimônio real final cairia R$ ${realLossFromExtraInf.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (para R$ ${realAtHigherInflation.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).`,
    },
  };
}
