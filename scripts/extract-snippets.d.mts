// Types for the pure helpers of scripts/extract-snippets.mjs (used by test/scripts/extract-snippets.test.ts).

/** One fenced block of a documentation file. `line` is the 1-based line of the opening fence. */
export interface DocBlock {
  id: string;
  file: string;
  line: number;
  /** The first word of the info string, lowercased (`""` for a bare fence). */
  lang: string;
  code: string;
  /** From `<!-- doctest:skip "reason" -->`. */
  skip?: string;
  /** From `<!-- doctest:project=… -->`. */
  project?: string;
}

/** A browser page of the manifest that e2e/docs.spec.ts loads. */
export interface DocPage {
  id: string;
  lang: string;
  html: string;
  seed?: string;
  fields?: string[];
}

export type Runner = 'browser' | 'node' | 'project' | 'text' | 'skip';

export const SEED: { lat: string; lng: string };
export function docFiles(root?: string): string[];
export function extract(file: string, text: string): { blocks: DocBlock[]; problems: string[] };
export function runnerOf(block: DocBlock): Runner;
export function checkRules(file: string, blocks: readonly DocBlock[], text: string): string[];
export function pageFor(block: DocBlock): DocPage;
export function renderTemplate(code: string): string;
export function stripJsonComments(text: string): string;
