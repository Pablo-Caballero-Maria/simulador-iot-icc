"use client";
/** Envoltorio que hace seleccionable un grupo de la escena (cursor y clic). */
import type { ReactNode } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { useSimStore } from "@/lib/sim-store";
import type { NodeId } from "@/sim/types";

export function Selectable({ node, children }: { node: NodeId; children: ReactNode }) {
  const select = useSimStore((s) => s.selectNode);
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = "pointer";
  };
  const onOut = () => {
    document.body.style.cursor = "";
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    select(node);
  };
  return (
    <group onPointerOver={onOver} onPointerOut={onOut} onClick={onClick}>
      {children}
    </group>
  );
}
