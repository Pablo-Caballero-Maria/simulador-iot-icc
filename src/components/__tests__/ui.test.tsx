// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { EconomicsCalculator } from "@/components/economics/EconomicsCalculator";
import { ClinicalConsole } from "@/components/panels/ClinicalConsole";
import { LevelBadge } from "@/components/ui/primitives";
import { Caption } from "@/components/simulator/SceneOverlay";
import { ToolPanel, ToolRail } from "@/components/simulator/ToolPanel";
import { useSimStore } from "@/lib/sim-store";
import { MINUTE } from "@/sim/core/time";

describe("LevelBadge", () => {
  it("muestra el nivel y su nombre", () => {
    render(<LevelBadge level="N3" />);
    expect(screen.getByText("N3 · Edge / Fog")).toBeInTheDocument();
  });
});

describe("EconomicsCalculator", () => {
  it("muestra el análisis de sensibilidad con los supuestos verificados", () => {
    render(<EconomicsCalculator />);
    const table = screen.getByRole("table");
    const row = within(table).getByText("Recuperación de la inversión").closest("tr")!;
    expect(
      within(row)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["Recuperación de la inversión", "no se recupera", "78 meses", "37 meses"]);
  });

  it("recalcula al cambiar un supuesto", () => {
    render(<EconomicsCalculator />);
    const slider = screen.getByLabelText(/Hospitalizaciones por IC por paciente y año/);
    fireEvent.change(slider, { target: { value: "0.6" } });
    const row = screen.getByText("Recuperación de la inversión").closest("tr")!;
    expect(within(row).getAllByRole("cell")[2].textContent).toBe("14 meses");
  });
});

describe("Consola clínica conectada a la simulación", () => {
  beforeEach(() => {
    act(() => useSimStore.getState().load("attack"));
  });

  it("muestra cómo el dispensador rechaza las órdenes del atacante", () => {
    const sim = useSimStore.getState().sim!;
    act(() => {
      sim.advance(5 * MINUTE);
      useSimStore.getState().refresh();
    });
    render(<ClinicalConsole />);
    expect(screen.getByText(/Rechazada por el dispensador: firma no válida/)).toBeInTheDocument();
    expect(screen.getByText(/Rechazada por el dispensador: orden ya ejecutada/)).toBeInTheDocument();
  });

  it("en modo manual el usuario puede atender una alerta crítica", () => {
    act(() => {
      useSimStore.getState().setParam("staff", "mode", "manual");
      useSimStore.getState().load("vt");
    });
    const sim = useSimStore.getState().sim!;
    expect(sim.params.staff.mode).toBe("manual");
    act(() => {
      sim.advance(2 * MINUTE);
      useSimStore.getState().refresh();
    });
    render(<ClinicalConsole />);
    act(() => fireEvent.click(screen.getByRole("button", { name: "Atender" })));
    const alert = sim.platform.alerts.find((a) => a.code === "vt")!;
    expect(alert.ackBy).toBe("Usuario (consola)");
    expect(sim.platform.ambulance.phase).toBe("outbound");
  });
});

describe("Interfaz minimalista", () => {
  beforeEach(() => {
    act(() => {
      useSimStore.getState().load("vt");
      useSimStore.setState({ panel: null });
    });
  });

  it("abre un único panel lateral a la vez y lo cierra al pulsar de nuevo", () => {
    render(
      <>
        <ToolRail onTour={() => {}} />
        <ToolPanel />
      </>,
    );
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    act(() => fireEvent.click(screen.getByRole("button", { name: "Datos" })));
    expect(screen.getByRole("complementary", { name: "Estadísticas" })).toBeInTheDocument();
    act(() => fireEvent.click(screen.getByRole("button", { name: "Parámetros" })));
    expect(screen.getAllByRole("complementary")).toHaveLength(1);
    expect(screen.getByRole("complementary", { name: "Parámetros" })).toBeInTheDocument();
    act(() => fireEvent.click(screen.getByRole("button", { name: "Parámetros" })));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("muestra solo la última explicación sobre la escena", () => {
    const sim = useSimStore.getState().sim!;
    act(() => {
      sim.advance(MINUTE);
      useSimStore.getState().refresh();
    });
    render(<Caption />);
    const latest = useSimStore.getState().narrations[0];
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByText(latest.title)).toBeInTheDocument();
    act(() => fireEvent.click(screen.getByRole("button", { name: "Ver todas las explicaciones" })));
    expect(useSimStore.getState().panel).toBe("explicacion");
  });
});

describe("ThemeToggle", () => {
  it("empieza en claro, cambia al oscuro y lo recuerda", async () => {
    const { ThemeToggle } = await import("@/components/ui/ThemeToggle");
    const { THEME_STORAGE_KEY } = await import("@/lib/theme");
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar al tema oscuro" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(await screen.findByRole("button", { name: "Cambiar al tema claro" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar al tema claro" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("SceneSkeleton", () => {
  it("anuncia que la escena 3D se está cargando", async () => {
    const { SceneSkeleton } = await import("@/components/simulator/SceneSkeleton");
    render(<SceneSkeleton />);
    expect(screen.getByRole("status", { name: "Cargando escena 3D" })).toBeInTheDocument();
  });
});
