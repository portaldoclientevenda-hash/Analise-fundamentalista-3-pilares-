/**
 * Coletor Automatizado de Dados Públicos (BCB SGS / B3 / CVM)
 * Executável via CLI (`npx tsx coletor/coletar.ts`) ou GitHub Actions.
 */
import fs from 'node:fs';
import path from 'node:path';

interface BcbPoint {
  data: string;
  valor: string;
}

async function fetchBcb(seriesId: number, label: string) {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesId}/dados/ultimos/1?formato=json`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return { label, seriesId, status: 'unavailable', error: `HTTP ${res.status}` };
    const arr = (await res.json()) as BcbPoint[];
    const item = arr[arr.length - 1];
    return {
      label,
      seriesId,
      value: item ? Number(item.valor.replace(',', '.')) : null,
      referenceDate: item?.data ?? null,
      source: 'Banco Central do Brasil (SGS)',
      sourceUrl: url,
      collectedAt: new Date().toISOString(),
      status: item ? 'live' : 'unavailable',
    };
  } catch (err) {
    return {
      label,
      seriesId,
      status: 'unavailable',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function fetchQuote(ticker: string) {
  const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return { ticker, status: 'unavailable', error: `HTTP ${res.status}` };
    const json = (await res.json()) as {
      results?: Array<{ regularMarketPrice?: number; regularMarketTime?: string }>;
    };
    const r = json.results?.[0];
    if (!r || typeof r.regularMarketPrice !== 'number') {
      return { ticker, status: 'unavailable', error: 'Sem cotação na resposta' };
    }
    return {
      ticker,
      price: r.regularMarketPrice,
      marketTime: r.regularMarketTime ?? null,
      source: 'brapi.dev (B3)',
      sourceUrl: url,
      collectedAt: new Date().toISOString(),
      status: 'live',
    };
  } catch (err) {
    return { ticker, status: 'unavailable', error: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  const tickers = ['WEGE3', 'ITUB4', 'EGIE3', 'VALE3', 'LREN3', 'TOTS3', 'BBSE3', 'HGLG11', 'KNCR11'];
  const [selic, cdi, ipca, ptax] = await Promise.all([
    fetchBcb(432, 'Selic Meta'),
    fetchBcb(4389, 'CDI Anualizado'),
    fetchBcb(13522, 'IPCA 12m'),
    fetchBcb(1, 'PTAX USD/BRL'),
  ]);

  const quotes = await Promise.all(tickers.map((t) => fetchQuote(t)));
  const snapshot = {
    generatedAt: new Date().toISOString(),
    macro: { selic, cdi, ipca, ptax },
    quotes,
  };

  const outDir = path.resolve(process.cwd(), 'coletor', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'latest_collection.json');
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf-8');
  console.log(`Coleta concluída em ${outPath}`);
}

main().catch((err) => {
  console.error('Erro no coletor:', err);
  process.exit(1);
});
