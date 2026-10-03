import { getPromotionSourceAdapter } from '../importers';
import { RepositoryValidationError } from '../repositories/errors';
import type { ImportSource } from '../repositories/types';
import { runPromotionImport } from '../services/promotionImportService';

const supportedSources: ImportSource[] = ['line-pay', 'jko-pay', 'ipass-money'];

export function parseImportSource(args: string[]): ImportSource {
  if (args.length === 0) {
    throw new RepositoryValidationError('source is required; use --source <source>');
  }

  if (args.length !== 2 || args[0] !== '--source') {
    throw new RepositoryValidationError('exactly one --source option is required');
  }

  const source = args[1];
  if (!supportedSources.includes(source as ImportSource)) {
    throw new RepositoryValidationError(`unsupported source: ${source}`);
  }

  return source as ImportSource;
}

export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  try {
    const source = parseImportSource(args);
    const run = await runPromotionImport(getPromotionSourceAdapter(source));
    process.stdout.write(
      `Import run ${run.id} for ${run.source} completed with ${run.draftCount} drafts.\n`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'promotion import failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
