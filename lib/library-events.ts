"use client";

import { useEffect, useState } from "react";
import type { DocumentDto } from "@/lib/types";

const EVENT = "amlc:documents";

// The Library tells the rail when the document list changes, so its count stays current.
export function announceDocuments(docs: DocumentDto[]) {
  window.dispatchEvent(new CustomEvent<number>(EVENT, { detail: docs.filter((d) => d.status === "ready").length }));
}

// Number of ready documents; undefined until known (or if the list can't be loaded).
export function useReadyCount() {
  const [count, setCount] = useState<number | undefined>(undefined);
  useEffect(() => {
    const onChange = (e: Event) => setCount((e as CustomEvent<number>).detail);
    window.addEventListener(EVENT, onChange);
    fetch("/api/documents", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<DocumentDto[]>) : null))
      .then((docs) => {
        if (docs) setCount(docs.filter((d) => d.status === "ready").length);
      })
      .catch(() => {});
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return count;
}
