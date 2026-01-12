import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import { createRoot } from "react-dom/client";
import App from "./App";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <WorkerPoolContextProvider
      poolOptions={{
        workerFactory: () => new Worker("/diffs-worker.js"),
        poolSize: 4,
      }}
      highlighterOptions={{
        theme: "pierre-dark",
      }}
    >
      <App />
    </WorkerPoolContextProvider>
  );
}
