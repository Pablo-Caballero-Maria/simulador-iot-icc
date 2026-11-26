import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/ui/Providers";
import { VercelTelemetry } from "@/components/ui/VercelTelemetry";
import { THEME_COLORS, THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Simulador IoT · Insuficiencia cardíaca",
    template: "%s · Simulador IoT ICC",
  },
  description:
    "Simulación 3D e interactiva de un sistema IoT Edge–Fog–Cloud para monitorizar en casa a pacientes con insuficiencia cardíaca: wearable con TinyML, estación domiciliaria con dispensador, BLE, LTE-M/NB-IoT, MQTT y plataforma clínica.",
};

export const viewport: Viewport = {
  // El del tema claro; ThemeToggle lo cambia con el tema (src/lib/theme.ts).
  themeColor: THEME_COLORS.light,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // El script del tema pone data-theme antes de que React hidrate: de ahí suppressHydrationWarning.
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Un <script> normal, no next/script: tiene que ejecutarse antes de pintar. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-slate-50 font-sans text-slate-900">
        <Providers>{children}</Providers>
        <VercelTelemetry />
      </body>
    </html>
  );
}
