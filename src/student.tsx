import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import StudentPage from "@/pages/StudentPage";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StudentPage />
  </StrictMode>,
);
