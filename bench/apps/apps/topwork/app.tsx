import { render } from "preact";
import { TopworkApp } from "./components/TopworkApp";
import { scenarios } from "./scenarios";
import { ScenarioManager } from "../../shared/utils/scenario-manager";

// Default scenario to use if none specified
let initialState = scenarios.default;

// Check for scenario parameter and load if found
ScenarioManager.loadFromUrl(
  {
    scenarios: Object.entries(scenarios).map(([id, data]) => ({ id, ...data })),
  },
  (scenarioData) => {
    // Remove the id field since it was added for ScenarioManager
    const { id, ...state } = scenarioData;
    initialState = state;
  },
);

render(
  <TopworkApp initialState={initialState} />,
  document.getElementById("app")!,
);
