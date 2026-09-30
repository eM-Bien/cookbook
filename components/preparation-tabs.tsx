"use client";

import { useState } from "react";

/** Steps of a recipe; with a Thermomix version they sit under two tabs. */
export function PreparationTabs({ steps, thermomix }: { steps: string[]; thermomix: string[] }) {
  const [tab, setTab] = useState<"classic" | "thermomix">("classic");
  if (steps.length === 0 && thermomix.length === 0) return null;

  const tabs = (
    <div className="prep-tabs" role="tablist" aria-label="Sposób przygotowania">
      <button
        type="button"
        role="tab"
        className="chip"
        aria-selected={tab === "classic"}
        onClick={() => setTab("classic")}
      >
        Klasycznie
      </button>
      <button
        type="button"
        role="tab"
        className="chip"
        aria-selected={tab === "thermomix"}
        onClick={() => setTab("thermomix")}
      >
        Thermomix
      </button>
    </div>
  );
  const shown = tab === "thermomix" ? thermomix : steps;

  return (
    <section>
      <div className="section-head">
        <h2 className="section-title">Przygotowanie</h2>
        {thermomix.length > 0 && tabs}
      </div>
      <ol className="step-list" role={thermomix.length > 0 ? "tabpanel" : undefined}>
        {shown.map((step, index) => (
          <li key={`${tab}-${index}`}>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
