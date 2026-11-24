import { DataStatus, HistoricalPoint } from '../types.ts';

export const EPSILON = 1e-9;

export function isFiniteNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val);
}

export function safeDivide(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
  options?: { allowZeroDenominator?: boolean; nearZeroThreshold?: number }
): { value: number | null; status: DataStatus; note?: string } {
  if (!isFiniteNumber(numerator) || !isFiniteNumber(denominator)) {
    return { value: null, status: 'unavailable', note: 'Dados de entrada ausentes para o cálculo.' };
  }
  const threshold = options?.nearZeroThreshold ?? 1e-6;
  if (Math.abs(denominator) <= threshold) {
    return {
      value: null,
      status: 'zero',
      note: 'Denominador nulo ou próximo de zero; quociente matematicamente indefinido.',
    };
  }
  const res = numerator / denominator;
  if (!Number.isFinite(res)) {
    return { value: null, status: 'unavailable', note: 'Resultado não finito.' };
  }
  return {
    value: res,
    status: res < 0 ? 'negative' : 'calculated',
  };
}

export function averageTwo(a: number | null | undefined, b: number | null | undefined): number | null {
  if (isFiniteNumber(a) && isFiniteNumber(b)) {
    return (a + b) / 2;
  }
  if (isFiniteNumber(b)) return b;
  if (isFiniteNumber(a)) return a;
  return null;
}

export function computeMean(values: (number | null | undefined)[]): number | null {
  const valid = values.filter(isFiniteNumber);
  if (valid.length === 0) return null;
  return valid.reduce((acc, v) => acc + v, 0) / valid.length;
}

export function computeMedian(values: (number | null | undefined)[]): number | null {
  const valid = values.filter(isFiniteNumber).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 !== 0 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

export function computeCagr(
  initialValue: number | null | undefined,
  finalValue: number | null | undefined,
  years: number
): { value: number | null; status: DataStatus; note?: string } {
  if (!isFiniteNumber(initialValue) || !isFiniteNumber(finalValue) || years <= 0) {
    return { value: null, status: 'unavailable', note: 'Dados insuficientes para o horizonte selecionado.' };
  }
  if (initialValue <= 0 || finalValue <= 0) {
    return {
      value: null,
      status: 'negative',
      note: 'CAGR não aplicável matematicamente quando valor inicial ou final é menor ou igual a zero (prejuízo ou base negativa).',
    };
  }
  const cagr = Math.pow(finalValue / initialValue, 1 / years) - 1;
  return {
    value: cagr * 100, // stored in %
    status: cagr < 0 ? 'negative' : 'calculated',
  };
}

export function classifyTrend(
  history: HistoricalPoint[],
  higherIsBetter = true
): 'crescimento_consistente' | 'estagnacao' | 'deterioracao' | 'recuperacao' | 'volatilidade_elevada' | 'dados_insuficientes' {
  const valid = history.map((h) => h.value).filter(isFiniteNumber);
  if (valid.length < 3) return 'dados_insuficientes';

  const diffs: number[] = [];
  for (let i = 1; i < valid.length; i++) {
    const prev = valid[i - 1];
    const curr = valid[i];
    if (Math.abs(prev) > 1e-6) {
      diffs.push((curr - prev) / Math.abs(prev));
    } else {
      diffs.push(curr - prev);
    }
  }

  const posCount = diffs.filter((d) => d > 0.02).length;
  const negCount = diffs.filter((d) => d < -0.02).length;
  const mean = computeMean(valid) ?? 0;
  const variance =
    valid.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / valid.length;
  const stdDev = Math.sqrt(variance);
  const cv = Math.abs(mean) > 1e-6 ? stdDev / Math.abs(mean) : stdDev;

  if (cv > 0.45 && posCount > 0 && negCount > 0) {
    return 'volatilidade_elevada';
  }

  const lastDiff = diffs[diffs.length - 1];
  const prevDiff = diffs[diffs.length - 2];

  if (higherIsBetter) {
    if (posCount >= diffs.length - 1 && valid[valid.length - 1] > valid[0]) {
      return 'crescimento_consistente';
    }
    if (negCount >= diffs.length - 1 && valid[valid.length - 1] < valid[0]) {
      return 'deterioracao';
    }
    if (prevDiff < -0.03 && lastDiff > 0.05) {
      return 'recuperacao';
    }
  } else {
    // e.g. debt/EBITDA where lower is better
    if (negCount >= diffs.length - 1 && valid[valid.length - 1] < valid[0]) {
      return 'crescimento_consistente';
    }
    if (posCount >= diffs.length - 1 && valid[valid.length - 1] > valid[0]) {
      return 'deterioracao';
    }
    if (prevDiff > 0.05 && lastDiff < -0.05) {
      return 'recuperacao';
    }
  }

  const totalChange =
    Math.abs(valid[0]) > 1e-6 ? (valid[valid.length - 1] - valid[0]) / Math.abs(valid[0]) : 0;
  if (Math.abs(totalChange) <= 0.06) return 'estagnacao';

  return totalChange > 0
    ? higherIsBetter
      ? 'crescimento_consistente'
      : 'deterioracao'
    : higherIsBetter
      ? 'deterioracao'
      : 'crescimento_consistente';
}

export function formatNumberPtBr(val: number | null | undefined, decimals = 2): string {
  if (!isFiniteNumber(val)) return 'Indisponível';
  return val.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatCurrencyBrlM(valMillions: number | null | undefined): string {
  if (!isFiniteNumber(valMillions)) return 'Indisponível';
  if (Math.abs(valMillions) >= 1000) {
    return `R$ ${(valMillions / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} bi`;
  }
  return `R$ ${valMillions.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;
}

export function formatIndicatorValue(
  val: number | null | undefined,
  unit: '%' | 'x' | 'BRL' | 'BRL_M' | 'dias' | 'pts' | 'score'
): string {
  if (!isFiniteNumber(val)) return 'Indisponível';
  switch (unit) {
    case '%':
      return `${formatNumberPtBr(val, 2)}%`;
    case 'x':
      return `${formatNumberPtBr(val, 2)}x`;
    case 'BRL':
      return `R$ ${formatNumberPtBr(val, 2)}`;
    case 'BRL_M':
      return formatCurrencyBrlM(val);
    case 'dias':
      return `${formatNumberPtBr(val, 0)} dias`;
    case 'pts':
    case 'score':
      return formatNumberPtBr(val, 2);
  }
}

export function checkAccountingIdentity(
  ativoTotal: number | null,
  passivoCirculante: number | null,
  passivoNaoCirculante: number | null,
  patrimonioLiquidoTotal: number | null
): { valid: boolean | null; difference: number | null; note: string } {
  if (
    !isFiniteNumber(ativoTotal) ||
    !isFiniteNumber(passivoCirculante) ||
    !isFiniteNumber(passivoNaoCirculante) ||
    !isFiniteNumber(patrimonioLiquidoTotal)
  ) {
    return {
      valid: null,
      difference: null,
      note: 'Dados insuficientes para validar a identidade contábil Ativo = Passivo + PL.',
    };
  }
  const passivoMaisPl = passivoCirculante + passivoNaoCirculante + patrimonioLiquidoTotal;
  const diff = ativoTotal - passivoMaisPl;
  const tolerance = Math.max(1.0, Math.abs(ativoTotal) * 0.005); // 0.5% rounding tolerance
  const valid = Math.abs(diff) <= tolerance;
  return {
    valid,
    difference: diff,
    note: valid
      ? 'Equação patrimonial validada (Ativo Total = Passivo + Patrimônio Líquido).'
      : `Divergência contábil detectada de ${diff.toFixed(2)} mi entre Ativo Total e Passivo + PL.`,
  };
}
