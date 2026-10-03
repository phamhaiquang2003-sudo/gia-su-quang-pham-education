import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ExercisePage from "@/pages/ExercisePage";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ExercisePage />
  </StrictMode>,
);
