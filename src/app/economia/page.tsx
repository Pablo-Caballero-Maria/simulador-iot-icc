import type { Metadata } from "next";
import { EconomicsCalculator } from "@/components/economics/EconomicsCalculator";
import { PageShell } from "@/components/ui/PageShell";

export const metadata: Metadata = {
  title: "Estudio económico",
  description: "Calculadora del retorno de la inversión del sistema IoT para pacientes con insuficiencia cardíaca.",
};

export default function EconomiaPage() {
  return (
    <PageShell
      title="Estudio económico"
      intro={
        <p>
          ¿Se paga el sistema con los ingresos que evita? Es el mismo modelo del apartado 6.15 de la memoria, con los
          supuestos verificados con datos españoles. Mueve los supuestos y observa cuándo se recupera la inversión.
        </p>
      }
    >
      <EconomicsCalculator />
    </PageShell>
  );
}
