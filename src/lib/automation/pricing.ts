/**
 * Quote estimation with the three point (PERT) technique (addresses P4).
 *
 * For every work package the developer's catalogue holds an optimistic (a),
 * most likely (m) and pessimistic (b) effort in hours. PERT gives
 *   expected E = (a + 4m + b) / 6      standard deviation SD = (b - a) / 6
 * Package variances are summed (independence assumption), and the quoted hours
 * add one standard deviation to the total expectation, which corresponds to roughly
 * an 84 % chance of not exceeding the quote under a normal approximation.
 * The structured catalogue counters the optimism bias of unaided expert estimates.
 */
import { BASE_EFFORT, BUSINESS, COMPLEXITY_FACTOR, FEATURES } from "../config";
import type { Complexity, ProjectType, QuoteLine } from "../types";

const round1 = (n: number) => Math.round(n * 10) / 10;
const roundHalf = (n: number) => Math.round(n * 2) / 2;
const roundEuro = (n: number) => Math.round(n * 100) / 100;

export function pertExpected(a: number, m: number, b: number): number {
  return (a + 4 * m + b) / 6;
}

export function pertStdDev(a: number, b: number): number {
  return (b - a) / 6;
}

export interface Estimate {
  lines: QuoteLine[];
  expectedHours: number;
  standardDeviation: number;
  quotedHours: number;
  totalNet: number;
  vat: number;
  totalGross: number;
  deposit: number;
}

export function estimate(projectType: ProjectType, features: string[], complexity: Complexity): Estimate {
  const factor = COMPLEXITY_FACTOR[complexity];
  const packages: Array<{ label: string; effort: [number, number, number] }> = [
    { label: `Base: ${projectType.replace("_", " ")}`, effort: BASE_EFFORT[projectType] },
    ...features.filter((f) => f in FEATURES).map((f) => FEATURES[f]),
    // project management and testing are always included (a constant share of the work)
    { label: "Project management and testing", effort: [4, 8, 14] },
  ];

  let expected = 0;
  let variance = 0;
  const lines: QuoteLine[] = packages.map(({ label, effort: [a, m, b] }) => {
    const [fa, fm, fb] = [a * factor, m * factor, b * factor];
    const e = pertExpected(fa, fm, fb);
    expected += e;
    variance += pertStdDev(fa, fb) ** 2;
    return { label, optimistic: round1(fa), mostLikely: round1(fm), pessimistic: round1(fb), expected: round1(e) };
  });

  const sd = Math.sqrt(variance);
  const quotedHours = roundHalf(expected + sd);
  const totalNet = roundEuro(quotedHours * BUSINESS.hourlyRate);
  const vat = roundEuro(totalNet * BUSINESS.vatRate);
  return {
    lines,
    expectedHours: round1(expected),
    standardDeviation: round1(sd),
    quotedHours,
    totalNet,
    vat,
    totalGross: roundEuro(totalNet + vat),
    deposit: roundEuro(totalNet * BUSINESS.depositRate),
  };
}
