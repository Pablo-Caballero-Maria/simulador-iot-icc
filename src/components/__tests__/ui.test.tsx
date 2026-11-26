// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReproduceWeek } from "@/components/results/ReproduceWeek";
import { runNormalWeek } from "@/sim/experiments";
import { fakeWorker } from "@/test/fake-worker";
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

  it("recalcula al mover un deslizador, y su campo lo refleja", () => {
    render(<EconomicsCalculator />);
    const slider = screen.getByLabelText("Hospitalizaciones por IC por paciente y año (deslizador)");
    fireEvent.change(slider, { target: { value: "0.6" } });
    const row = screen.getByText("Recuperación de la inversión").closest("tr")!;
    expect(within(row).getAllByRole("cell")[2].textContent).toBe("14 meses");
    expect(screen.getByRole("spinbutton", { name: "Hospitalizaciones por IC por paciente y año" })).toHaveValue(0.6);
  });

  it("acepta un valor exacto escrito, y explica el que no vale sin perder los resultados", async () => {
    render(<EconomicsCalculator />);
    const field = screen.getByRole("spinbutton", { name: "Precio del kit" });
    const payback = () =>
      within(screen.getByText("Recuperación de la inversión").closest("tr")!).getAllByRole("cell")[2].textContent;
    const before = payback();

    fireEvent.change(field, { target: { value: "50" } });
    expect(await screen.findByText("Entre 300 y 1500.")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(payback()).toBe(before);

    fireEvent.change(field, { target: { value: "455" } });
    await waitFor(() => expect(screen.queryByText("Entre 300 y 1500.")).not.toBeInTheDocument());
    expect(screen.getByText("455 €")).toBeInTheDocument();
    expect(payback()).not.toBe(before);

    fireEvent.click(screen.getByRole("button", { name: "Restablecer" }));
    await waitFor(() => expect(field).toHaveValue(700));
    expect(payback()).toBe(before);
  });
});

describe("ReproduceWeek", () => {
  const published = {
    autonomyDays: 46.1,
    wanPerDayKB: 53.1,
    blePerDayKB: 17.2,
    accuracyPct: 99.79,
    falseAlertsPerWeek: 0,
  };

  function renderWithQuery(ui: ReactNode) {
    return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
  }

  it("simula semanas con semillas nuevas junto a la media de la memoria", async () => {
    const run = runNormalWeek(6, 1);
    const createWorker = vi.fn(
      () =>
        fakeWorker((request: unknown) => ({
          ok: true,
          run: { ...run, seed: (request as { seed: number }).seed },
        })) as unknown as Worker,
    );
    renderWithQuery(<ReproduceWeek published={published} createWorker={createWorker} />);
    expect(screen.getByRole("row", { name: /Memoria/ })).toHaveTextContent("46,1 días");

    fireEvent.click(screen.getByRole("button", { name: "Simular una semana" }));
    const row = await screen.findByRole("row", { name: /Semilla 6/ });
    await waitFor(() =>
      expect(row).toHaveTextContent(
        `${run.autonomy.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} días`,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Simular otra semana" }));
    expect(await screen.findByRole("row", { name: /Semilla 7/ })).toBeInTheDocument();
    expect(createWorker).toHaveBeenCalledTimes(2);
  });

  it("dice si la simulación falla", async () => {
    renderWithQuery(
      <ReproduceWeek published={published} createWorker={() => fakeWorker(null, "sin memoria") as unknown as Worker} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Simular una semana" }));
    expect(await screen.findByText("No se pudo simular: sin memoria")).toBeInTheDocument();
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
