import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG_FILE,
  DEFAULT_OUT_DIR,
  parseBuildOptions,
} from '../cli/commands/build-options.js';

describe('build option boundary', () => {
  it('accepts a complete, valid option set', () => {
    const options = parseBuildOptions({
      outDir: 'web',
      config: 'custom.config.js',
      strict: true,
    });
    expect(options).toEqual({
      outDir: 'web',
      config: 'custom.config.js',
      strict: true,
    });
  });

  it('fills missing options from defaults (completeness)', () => {
    const options = parseBuildOptions({});
    expect(options).toEqual({
      outDir: DEFAULT_OUT_DIR,
      config: DEFAULT_CONFIG_FILE,
      strict: false,
    });
  });

  it('rejects a wrong-typed outDir', () => {
    expect(() => parseBuildOptions({ outDir: 42 })).toThrow(
      /invalid build options.*outDir/i,
    );
  });

  it('rejects an empty outDir', () => {
    expect(() => parseBuildOptions({ outDir: '' })).toThrow(
      /invalid build options.*outDir/i,
    );
  });

  it('rejects an empty config path', () => {
    expect(() => parseBuildOptions({ config: '' })).toThrow(
      /invalid build options/i,
    );
  });

  it('rejects a non-boolean strict value', () => {
    expect(() => parseBuildOptions({ strict: 'yes' })).toThrow(
      /invalid build options/i,
    );
  });

  it('rejects unknown keys', () => {
    expect(() => parseBuildOptions({ output: 'x' })).toThrow(
      /invalid build options/i,
    );
  });
});