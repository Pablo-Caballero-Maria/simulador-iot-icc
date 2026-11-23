"use client";
/**
 * Raíz del simulador. La escena 3D ocupa toda la pantalla y solo muestra lo
 * imprescindible (estado, última explicación y ECG); el resto de la
 * información se abre bajo demanda en un único panel lateral.
 */
import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";
import { startSimulationLoop, useSimStore } from "@/lib/sim-store";
import { TopBar } from "@/components/panels/TopBar";
import { EcgMonitor } from "@/components/panels/EcgMonitor";
import { Caption, NodeCard, StatusChips, ViewMenu } from "./SceneOverlay";
import { ToolPanel, ToolRail } from "./ToolPanel";
import { SceneSkeleton } from "./SceneSkeleton";
import { Tour } from "./Tour";

const SimulationScene = dynamic(() => import("@/components/scene/SimulationScene"), {
  ssr: false,
  loading: () => <SceneSkeleton />,
});

const TOUR_SEEN_KEY = "simulador-icc:recorrido-visto";

const noSubscription = () => () => {};

function readTourSeen(): boolean {
  try {
    return window.localStorage.getItem(TOUR_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function SimulatorApp() {
  const load = useSimStore((s) => s.load);
  const ready = useSimStore((s) => s.sim !== null);
  const panel = useSimStore((s) => s.panel);
  const tourSeen = useSyncExternalStore(noSubscription, readTourSeen, () => true);
  const [manualStep, setManualStep] = useState<number | null>(null);
  const [tourClosed, setTourClosed] = useState(false);
  // El recorrido se abre solo la primera vez; después, desde el botón «Guía».
  const tourStep = manualStep ?? (!tourSeen && !tourClosed ? 0 : null);

  useEffect(() => {
    if (!useSimStore.getState().sim) load("normal");
    return startSimulationLoop();
  }, [load]);

  const closeTour = () => {
    setManualStep(null);
    setTourClosed(true);
    try {
      window.localStorage.setItem(TOUR_SEEN_KEY, "1");
    } catch {
      // Sin almacenamiento (modo privado): no pasa nada.
    }
  };

  return (
    <div className="flex h-dvh min-h-[560px] flex-col overflow-hidden bg-slate-50">
      <TopBar />
      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="relative min-h-0 min-w-0 flex-1">
          {ready ? <SimulationScene /> : null}
          <div className="pointer-events-none absolute inset-0 z-[11] flex flex-col justify-between gap-3 p-3">
            <div className="flex flex-wrap-reverse items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col items-start gap-2">
                <StatusChips />
                <NodeCard />
              </div>
              <div className="ml-auto">
                <ViewMenu />
              </div>
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 sm:max-w-[30rem] sm:flex-1">
                {tourStep !== null ? (
                  <Tour step={tourStep} onStep={setManualStep} onClose={closeTour} />
                ) : panel !== "explicacion" ? (
                  <Caption />
                ) : null}
              </div>
              <div className="hidden sm:block">
                <EcgMonitor />
              </div>
            </div>
          </div>
        </main>
        <ToolPanel />
        <ToolRail onTour={() => setManualStep(0)} />
      </div>
    </div>
  );
}
