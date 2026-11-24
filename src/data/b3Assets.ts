import { AssetRawData } from '../engine/types.ts';
import { B3_ASSETS_PART1 } from './b3StocksPart1.ts';
import { B3_ASSETS_PART2 } from './b3StocksPart2.ts';

export const B3_ASSETS: AssetRawData[] = [...B3_ASSETS_PART1, ...B3_ASSETS_PART2];

export function getAssetByTicker(ticker: string): AssetRawData | undefined {
  const norm = ticker.trim().toUpperCase();
  return B3_ASSETS.find((a) => a.ticker === norm);
}
