"use client";
/** Eventos que el usuario puede provocar sobre la marcha, agrupados y plegables. */
import type { ReactNode } from "react";
import { useSimStore } from "@/lib/sim-store";
import { LevelBadge, Section, cx } from "@/components/ui/primitives";
import type { Simulation } from "@/sim/simulation";
import type { IotLevel } from "@/sim/types";

interface Action {
  label: string;
  level: IotLevel;
  help: string;
  run: (sim: Simulation) => void;
  danger?: boolean;
}

const PATIENT: Action[] = [
  {
    label: "Taquicardia ventricular (3 min)",
    level: "N1",
    help: "Arritmia crítica: aviso local y alerta de clase 1.",
    run: (sim) => sim.triggerRhythm("vt", 180, 182),
    danger: true,
  },
  {
    label: "Fibrilación auricular (15 min)",
    level: "N1",
    help: "Alerta de clase 2 si dura ≥ 30 s.",
    run: (sim) => sim.triggerRhythm("af", 900, 118),
  },
  {
    label: "Pausa de 6 s",
    level: "N1",
    help: "La detecta una regla independiente de la red.",
    run: (sim) => sim.triggerRhythm("pause", 6),
  },
  {
    label: "Extrasístoles (10 min)",
    level: "N1",
    help: "Se registran en el vector; no generan alerta.",
    run: (sim) => sim.triggerRhythm("ectopy", 600),
  },
  {
    label: "Pulsar el botón de síntomas",
    level: "N1",
    help: "Envía una tira de 30 s marcada como sintomática.",
    run: (sim) => sim.pressSymptomButton(),
  },
  {
    label: "Artefactos de movimiento (30 s)",
    level: "N3",
    help: "La red los clasifica como ruido y no avisa.",
    run: (sim) => sim.triggerCondition("noisy", 30),
  },
  {
    label: "Electrodo despegado (3 min)",
    level: "N1",
    help: "Aviso técnico tras 1 min, sin confundirlo con una pausa.",
    run: (sim) => sim.triggerCondition("lead-off", 180),
  },
];

const SECURITY: Action[] = [
  {
    label: "Inyectar una orden de dosis falsa",
    level: "T",
    help: "El dispensador comprueba la firma ECDSA del cardiólogo.",
    run: (sim) => sim.injectAttack("forged"),
    danger: true,
  },
  {
    label: "Repetir una orden ya ejecutada",
    level: "T",
    help: "Se rechaza por identificador y número de secuencia.",
    run: (sim) => sim.injectAttack("replay"),
    danger: true,
  },
];

export function ActionsPanel() {
  const sim = useSimStore((s) => s.sim);
  const outage = useSimStore((s) => s.snapshot?.cellular.outage ?? false);
  if (!sim) return null;
  const home: Action[] = [
    {
      label: "Una visita usa la báscula",
      level: "N3",
      help: "La estación descarta el peso: el wearable no está junto a la báscula.",
      run: (s) => s.visitorWeighs(),
    },
    {
      label: outage ? "Restablecer la red móvil" : "Cortar la red móvil",
      level: "N2",
      help: "Sin red, la estación guarda los mensajes y al volver los envía por prioridad.",
      run: (s) => s.setCellularOutage(!outage),
    },
  ];
  return (
    <div className="space-y-2">
      <p className="pb-1 text-xs leading-relaxed text-slate-500">
        Provoca una situación y observa cómo responde cada nivel. A 1× o 5× se ven mejor los mensajes.
      </p>
      <Group title="Paciente" defaultOpen>
        {PATIENT.map((a) => (
          <ActionRow key={a.label} action={a} onRun={() => a.run(sim)} />
        ))}
      </Group>
      <Group title="Domicilio y red">
        {home.map((a) => (
          <ActionRow key={a.label} action={a} onRun={() => a.run(sim)} />
        ))}
      </Group>
      <Group title="Seguridad">
        {SECURITY.map((a) => (
          <ActionRow key={a.label} action={a} onRun={() => a.run(sim)} />
        ))}
      </Group>
    </div>
  );
}

function Group({ title, children, defaultOpen }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <Section title={title} collapsible defaultOpen={defaultOpen}>
      <ul className="-mx-1 space-y-0.5">{children}</ul>
    </Section>
  );
}

function ActionRow({ action: a, onRun }: { action: Action; onRun: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onRun}
        className="group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-50"
      >
        <span className="min-w-0 flex-1">
          <span
            className={cx(
              "block text-xs font-medium",
              a.danger ? "text-rose-700" : "text-slate-800 group-hover:text-cyan-800",
            )}
          >
            {a.label}
          </span>
          <span className="block text-[11px] leading-snug text-slate-500">{a.help}</span>
        </span>
        <LevelBadge level={a.level} compact />
      </button>
    </li>
  );
}
