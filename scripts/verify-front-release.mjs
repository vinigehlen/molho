import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const FRONT_OUTPUTS = ['apps/storefront/.next', 'apps/backoffice/.next', 'apps/site/.next'];
const FORBIDDEN = [
  'api.staging.molho.live',
  'staging-app.molho.live',
  'molho.vercel.app',
  'molho-backoffice-staging',
  'MOLHO_STAFF_ACCESS_TOKEN',
];
const TEXT_EXTENSIONS = new Set(['.html', '.js', '.json', '.txt']);

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(path));
    else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name))) files.push(path);
  }
  return files;
}

const findings = [];
let scanned = 0;
for (const output of FRONT_OUTPUTS) {
  const directory = join(ROOT, output);
  try {
    if (!(await stat(directory)).isDirectory()) throw new Error('not a directory');
  } catch {
    throw new Error(`Build ausente: ${output}. Rode pnpm build antes da varredura.`);
  }

  try {
    if (!(await stat(join(directory, 'BUILD_ID'))).isFile()) throw new Error('not a file');
  } catch {
    throw new Error(
      `Build incompleto: ${output} não contém BUILD_ID. Pare os servidores dev e rode pnpm build antes da varredura.`,
    );
  }

  for (const file of await filesBelow(directory)) {
    const content = await readFile(file, 'utf8');
    scanned += 1;
    for (const value of FORBIDDEN) {
      if (content.includes(value)) findings.push(`${relative(ROOT, file)} contém ${value}`);
    }
  }
}

if (findings.length > 0) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Varredura dos fronts concluída: ${scanned} artefatos, zero endpoint proibido.`);
}
