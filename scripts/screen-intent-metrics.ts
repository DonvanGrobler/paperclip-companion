export interface IntentPrediction {
  id: string;
  expectedScreen: boolean;
  predictedScreen: boolean;
}
/** Aggregate only; deliberately accepts no prompt text. Null metrics avoid a false perfect score. */
export function intentMetrics(cases: readonly IntentPrediction[]) {
  const tp = cases.filter((c) => c.expectedScreen && c.predictedScreen).length;
  const fp = cases.filter((c) => !c.expectedScreen && c.predictedScreen).length;
  const fn = cases.filter((c) => c.expectedScreen && !c.predictedScreen).length;
  const tn = cases.length - tp - fp - fn;
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  return {
    total: cases.length,
    tp,
    fp,
    fn,
    tn,
    precision,
    recall,
    precisionTargetMet: precision !== null && precision >= 0.98,
    recallTargetMet: recall !== null && recall >= 0.9,
    falsePositiveIds: cases
      .filter((c) => !c.expectedScreen && c.predictedScreen)
      .map((c) => c.id),
    missedRequestIds: cases
      .filter((c) => c.expectedScreen && !c.predictedScreen)
      .map((c) => c.id),
  };
}
