export type UsageTotals = {
  promptTokens: number;
  completionTokens: number;
  totalCostUsd: number;
};

const state: UsageTotals = {
  promptTokens: 0,
  completionTokens: 0,
  totalCostUsd: 0,
};

/** Rough heuristic when API does not return cost */
const USD_PER_1K_PROMPT = 0.00015;
const USD_PER_1K_COMPLETION = 0.0006;

export function recordUsage(
  promptTokens: number,
  completionTokens: number,
  reportedCostUsd?: number,
): void {
  state.promptTokens += promptTokens;
  state.completionTokens += completionTokens;
  if (reportedCostUsd != null) state.totalCostUsd += reportedCostUsd;
  else {
    state.totalCostUsd +=
      (promptTokens / 1000) * USD_PER_1K_PROMPT +
      (completionTokens / 1000) * USD_PER_1K_COMPLETION;
  }
}

export function getUsageTotals(): UsageTotals {
  return { ...state };
}

export function resetUsage(): void {
  state.promptTokens = 0;
  state.completionTokens = 0;
  state.totalCostUsd = 0;
}
