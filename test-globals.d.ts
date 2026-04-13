declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void | Promise<void>) => void;

declare const expect: {
  (value: unknown): {
    toBe: (expected: unknown) => void;
    toEqual: (expected: unknown) => void;
    toContain: (expected: unknown) => void;
    toBeDefined: () => void;
    toBeUndefined: () => void;
    toBeNull: () => void;
    toBeTruthy: () => void;
    toBeFalsy: () => void;
    toHaveLength: (expected: number) => void;
    toMatch: (expected: RegExp | string) => void;
    toBeGreaterThan: (expected: number) => void;
    toBeGreaterThanOrEqual: (expected: number) => void;
    toBeLessThan: (expected: number) => void;
    toBeLessThanOrEqual: (expected: number) => void;
  };
};

declare const jest: {
  fn: <T extends (...args: unknown[]) => unknown = (...args: unknown[]) => unknown>(impl?: T) => T;
  mock: (moduleName: string, factory?: () => unknown) => void;
  requireActual: <T = unknown>(moduleName: string) => T;
};
