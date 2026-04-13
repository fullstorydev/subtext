/**
 * Scenario management utilities for Potemkin applications
 * Provides reusable scenario loading and initialization
 */

export interface ScenarioConfig<T> {
  scenarios: T[];
  transformData?: (scenarioData: T) => Record<string, any>;
}

export class ScenarioManager {
  /**
   * Check URL for scenario parameter and initialize if found
   * Returns true if a scenario was loaded, false otherwise
   */
  static loadFromUrl<T extends { id: string }>(
    config: ScenarioConfig<T>,
    applyScenario: (scenarioData: Record<string, any>) => void,
  ): boolean {
    const params = new URLSearchParams(window.location.search);
    const scenarioId = params.get("scenario");

    if (!scenarioId) {
      return false;
    }

    const scenario = config.scenarios.find((s) => s.id === scenarioId);
    if (!scenario) {
      console.warn(`Scenario '${scenarioId}' not found, using default`);
      // Still remove the invalid scenario parameter
      const url = new URL(window.location.href);
      url.searchParams.delete("scenario");
      history.replaceState(null, "", url.toString());
      return false;
    }

    // Transform the scenario data if a transformer is provided
    const transformedData = config.transformData
      ? config.transformData(scenario)
      : (scenario as unknown as Record<string, any>);

    // Apply the scenario
    applyScenario(transformedData);

    // Strip the scenario parameter to prevent re-initialization on refresh
    const url = new URL(window.location.href);
    url.searchParams.delete("scenario");
    history.replaceState(null, "", url.toString());

    return true;
  }

  /**
   * Get scenario by id
   */
  static getScenario<T extends { id: string }>(
    scenarios: T[],
    id: string,
  ): T | undefined {
    return scenarios.find((s) => s.id === id);
  }

  /**
   * Get all scenario ids
   */
  static getScenarioIds<T extends { id: string }>(scenarios: T[]): string[] {
    return scenarios.map((s) => s.id);
  }
}
