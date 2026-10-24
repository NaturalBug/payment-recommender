import { parseImportSource } from '../scripts/importPromotions';

describe('promotion import CLI', () => {
  test('parses a supported source option', () => {
    expect(parseImportSource(['--source', 'line-pay'])).toBe('line-pay');
  });

  test('rejects a missing source option', () => {
    expect(() => parseImportSource([])).toThrow('source is required');
  });

  test('rejects an unsupported source', () => {
    expect(() => parseImportSource(['--source', 'unknown'])).toThrow('unsupported source');
  });

  test('rejects duplicate source options', () => {
    expect(() => parseImportSource(['--source', 'line-pay', '--source', 'jko-pay']))
      .toThrow('exactly one --source');
  });
});
