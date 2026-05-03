"use client";

import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useStore } from "./store";

const UNDO_MS = 15_000;

export function useDeleteContact() {
  const deletePerson = useStore((s) => s.deletePerson);
  const restorePerson = useStore((s) => s.restorePerson);
  const router = useRouter();
  return (id: string, redirect?: string) => {
    const person = useStore.getState().people.find((p) => p.id === id);
    if (!person) return;
    const related = deletePerson(id);
    if (!related) return;
    if (redirect) router.push(redirect);
    toast(`Contacto eliminado · ${person.fullName}`, {
      description: `Se borraron también ${related.encounters.length} encuentros, ${related.interactions.length} notas.`,
      duration: UNDO_MS,
      action: { label: "Deshacer", onClick: () => restorePerson(person, related) },
    });
  };
}

export function useDeleteEncounter() {
  const deleteEncounter = useStore((s) => s.deleteEncounter);
  const restoreEncounter = useStore((s) => s.restoreEncounter);
  return (id: string, personName?: string) => {
    const result = deleteEncounter(id);
    if (!result) return;
    toast(`Encuentro eliminado${personName ? ` · ${personName}` : ""}`, {
      duration: UNDO_MS,
      action: { label: "Deshacer", onClick: () => restoreEncounter(result.encounter, result.interaction) },
    });
  };
}

export function useDeleteInteraction() {
  const deleteInteraction = useStore((s) => s.deleteInteraction);
  const restoreInteraction = useStore((s) => s.restoreInteraction);
  return (id: string) => {
    const it = deleteInteraction(id);
    if (!it) return;
    toast("Nota eliminada", {
      duration: UNDO_MS,
      action: { label: "Deshacer", onClick: () => restoreInteraction(it) },
    });
  };
}

export function useArchivePerson() {
  const archivePerson = useStore((s) => s.archivePerson);
  return (id: string, archived: boolean, personName?: string) => {
    archivePerson(id, archived);
    toast(archived ? `Archivado${personName ? ` · ${personName}` : ""}` : `Desarchivado${personName ? ` · ${personName}` : ""}`, {
      duration: 6000,
      action: { label: "Deshacer", onClick: () => archivePerson(id, !archived) },
    });
  };
}
