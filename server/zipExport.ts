import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export interface ZipEntryInput {
  name: string;
  data: Buffer;
  mtime?: Date;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function computeCrc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosTimeDate(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { dosTime, dosDate };
}

export function buildZipBuffer(entries: ZipEntryInput[]): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const cleanName = entry.name.replace(/^\/+/, '').replace(/\\/g, '/');
    const nameBuf = Buffer.from(cleanName, 'utf8');
    const uncompressed = entry.data;
    const crc = computeCrc32(uncompressed);
    const deflated = zlib.deflateRawSync(uncompressed, { level: 6 });

    const useDeflate = deflated.length < uncompressed.length;
    const payload = useDeflate ? deflated : uncompressed;
    const method = useDeflate ? 8 : 0;
    const { dosTime, dosDate } = toDosTimeDate(entry.mtime ?? new Date());

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed 2.0
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra len

    localChunks.push(localHeader, nameBuf, payload);

    // Central directory header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x0314, 4); // version made by: Unix PKZIP 2.0
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 filename flag
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(uncompressed.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra len
    centralHeader.writeUInt16LE(0, 32); // comment len
    centralHeader.writeUInt16LE(0, 34); // disk start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attrs (-rw-r--r--)
    centralHeader.writeUInt32LE(offset, 42);

    centralChunks.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralDir = Buffer.concat(centralChunks);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralDir, eocd]);
}

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.aistudio',
  'coverage',
  '.next',
  '.turbo',
]);

const EXCLUDED_REL_PREFIXES = ['public/assets/aistudio'];

const MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

function isSensitiveOrExcludedFile(fileName: string, relPosix: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower === '.ds_store' || lower === 'thumbs.db') return true;
  if (lower.endsWith('.zip') || lower.endsWith('.log')) return true;
  if (lower.endsWith('.pem') || lower.endsWith('.key') || lower.endsWith('.p12') || lower.endsWith('.pfx')) {
    return true;
  }
  if ((lower === '.env' || lower.startsWith('.env.')) && lower !== '.env.example') {
    return true;
  }
  for (const prefix of EXCLUDED_REL_PREFIXES) {
    if (relPosix === prefix || relPosix.startsWith(`${prefix}/`)) {
      return true;
    }
  }
  return false;
}

const GENERATED_README = `# Ápice Research — Análise Fundamentalista B3 (3 Pilares)

Pacote completo da aplicação web e servidor Express/Vite para análise fundamentalista de ativos da B3.

## Como executar localmente

1. Instale o Node.js 20+ (ou superior).
2. Instale as dependências:
   \`\`\`bash
   npm install
   \`\`\`
3. Configure as variáveis de ambiente copiando \`.env.example\` para \`.env\`:
   \`\`\`bash
   cp .env.example .env
   \`\`\`
   - Defina \`GEMINI_API_KEY\` se desejar habilitar os resumos e Q&A executivos com Gemini.
   - Defina \`APP_URL="http://localhost:3000"\`.
4. Inicie em modo desenvolvimento (porta 3000):
   \`\`\`bash
   npm run dev
   \`\`\`
5. Para gerar build de produção e rodar o servidor:
   \`\`\`bash
   npm run build
   NODE_ENV=production npm start
   \`\`\`

## Scripts disponíveis

- \`npm run dev\`: inicia servidor Express + Vite na porta 3000.
- \`npm run build\`: gera o bundle de produção em \`dist/\`.
- \`npm run lint\`: executa verificação de tipos TypeScript (\`tsc --noEmit\`).
- \`npx tsx --test tests/*.test.ts\`: executa os testes unitários do motor financeiro, comparador, simulador e exportador.
`;

export function collectAppSourceEntries(rootDir: string): ZipEntryInput[] {
  const resolvedRoot = path.resolve(rootDir);
  const entries: ZipEntryInput[] = [];
  let totalBytes = 0;
  let hasReadme = false;

  const walk = (currentDir: string) => {
    const dirItems = fs.readdirSync(currentDir, { withFileTypes: true });
    dirItems.sort((a, b) => a.name.localeCompare(b.name));

    for (const item of dirItems) {
      if (item.isSymbolicLink()) continue;
      const fullPath = path.resolve(currentDir, item.name);
      if (!fullPath.startsWith(resolvedRoot + path.sep)) continue;

      const relPosix = path.relative(resolvedRoot, fullPath).split(path.sep).join('/');

      if (item.isDirectory()) {
        if (EXCLUDED_DIRS.has(item.name)) continue;
        if (EXCLUDED_REL_PREFIXES.some((p) => relPosix === p || relPosix.startsWith(`${p}/`))) {
          continue;
        }
        walk(fullPath);
        continue;
      }

      if (!item.isFile()) continue;
      if (isSensitiveOrExcludedFile(item.name, relPosix)) continue;

      const stat = fs.statSync(fullPath);
      if (stat.size > MAX_SINGLE_FILE_BYTES) continue;
      if (totalBytes + stat.size > MAX_TOTAL_UNCOMPRESSED_BYTES) continue;

      const data = fs.readFileSync(fullPath);
      totalBytes += data.length;
      if (relPosix.toLowerCase() === 'readme.md') hasReadme = true;
      entries.push({
        name: `apice-research/${relPosix}`,
        data,
        mtime: stat.mtime,
      });
    }
  };

  walk(resolvedRoot);

  if (!hasReadme) {
    entries.push({
      name: 'apice-research/README.md',
      data: Buffer.from(GENERATED_README, 'utf8'),
      mtime: new Date(),
    });
  }

  return entries;
}

export function buildAppZipArchive(rootDir: string): {
  buffer: Buffer;
  fileCount: number;
  entryNames: string[];
} {
  const entries = collectAppSourceEntries(rootDir);
  const buffer = buildZipBuffer(entries);
  return {
    buffer,
    fileCount: entries.length,
    entryNames: entries.map((e) => e.name),
  };
}
