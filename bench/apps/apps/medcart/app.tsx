import { render } from "preact";
import { MedCartApp } from "./components/MedCartApp";
import { scenarios } from "./scenarios";
import { ScenarioManager } from "../../shared/utils/scenario-manager";

let initialState = scenarios.default;

ScenarioManager.loadFromUrl(
  {
    scenarios: Object.entries(scenarios).map(([id, data]) => ({ id, ...data })),
  },
  (scenarioData) => {
    const { id, ...state } = scenarioData;
    initialState = state;
  },
);

render(
  <MedCartApp initialState={initialState} />,
  document.getElementById("app")!,
);
