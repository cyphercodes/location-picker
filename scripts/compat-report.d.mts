// Types for scripts/compat-report.mjs (used by e2e/compat-reporter.ts and test/scripts/compat-report.test.ts).
import type { CompatReport } from '../src/internal/contracts.js';

/** The statement `notCovered` must always carry (CONTRACT §12.8). */
export const REAL_HARDWARE: 'Real iOS/Android hardware (emulation only)';

/** Every problem that makes `report` not a §12.8 CompatReport; empty when it is valid. */
export function validateCompatReport(report: unknown): string[];

/** COMPATIBILITY.md for a valid report. */
export function renderCompatibility(report: CompatReport): string;
