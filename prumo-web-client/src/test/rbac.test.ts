import { describe, expect, it } from "vitest";

import {
  canApprovePedidos,
  canEditPedidosBase,
  canManageCadastros,
  canReceivePedidos,
  hasObraAccess,
  hasOperationalAccess,
} from "@/lib/rbac";

describe("rbac helpers", () => {
  it("enforces operational access requirements", () => {
    expect(hasOperationalAccess(true, "master", 0)).toBe(true);
    expect(hasOperationalAccess(true, "gestor", 0)).toBe(true);
    expect(hasOperationalAccess(true, "operacional", 1)).toBe(true);
    expect(hasOperationalAccess(true, "operacional", 0)).toBe(false);
    expect(hasOperationalAccess(false, "gestor", 3)).toBe(false);
    expect(hasOperationalAccess(true, null, 3)).toBe(false);
  });

  it("enforces obra scoping (obra A vs obra B)", () => {
    const obraA = "obra-a";
    const obraB = "obra-b";

    expect(hasObraAccess("master", [], obraA)).toBe(true);
    expect(hasObraAccess("gestor", [], obraA)).toBe(true);
    expect(hasObraAccess("operacional", [obraA], obraA)).toBe(true);
    expect(hasObraAccess("operacional", [obraA], obraB)).toBe(false);
  });

  it("maps permissions by role", () => {
    expect(canManageCadastros("master")).toBe(true);
    expect(canManageCadastros("gestor")).toBe(true);
    expect(canManageCadastros("operacional")).toBe(true);
    expect(canManageCadastros("engenheiro")).toBe(false);

    expect(canEditPedidosBase("master")).toBe(true);
    expect(canEditPedidosBase("operacional")).toBe(true);
    expect(canEditPedidosBase("engenheiro")).toBe(false);

    expect(canApprovePedidos("master")).toBe(true);
    expect(canApprovePedidos("engenheiro")).toBe(true);
    expect(canApprovePedidos("almoxarife")).toBe(false);

    expect(canReceivePedidos("master")).toBe(true);
    expect(canReceivePedidos("almoxarife")).toBe(true);
    expect(canReceivePedidos("operacional")).toBe(false);
  });
});
