import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  themeColor: "#f8fafc",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-slate-50 font-sans text-slate-900">{children}</body>
    </html>
  );
}
