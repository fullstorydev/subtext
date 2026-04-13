import { render } from "preact";
import { TodoApp } from "./components/TodoApp";

// Render the app
const container = document.getElementById("app");
if (container) {
  render(<TodoApp />, container);
}
