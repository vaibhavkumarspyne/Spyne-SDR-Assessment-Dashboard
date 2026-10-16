"use client";

import { useEffect, useState } from "react";

/**
 * A written answer that survives a closed tab or a refresh: kept in this browser only, until the test is submitted.
 * Storage can be unavailable (private windows), so every access is guarded and the field still works without it.
 */
export default function DraftAnswer({ name, draftKey }: { name: string; draftKey: string }) {
  const [value, setValue] = useState("");

  useEffect(() => {
    try { setValue(localStorage.getItem(draftKey) ?? ""); } catch {}
  }, [draftKey]);

  return (
    <textarea
      name={name}
      rows={8}
      value={value}
      maxLength={20000}
      onChange={(e) => {
        setValue(e.target.value);
        try { localStorage.setItem(draftKey, e.target.value); } catch {}
      }}
      placeholder="Type your answer here."
    />
  );
}

/** Clears this test's drafts once the trainee submits. */
export function ClearDraftsOnSubmit({ prefix }: { prefix: string }) {
  useEffect(() => {
    const form = document.getElementById("take-form");
    const clear = () => {
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k?.startsWith(prefix)) localStorage.removeItem(k);
        }
      } catch {}
    };
    form?.addEventListener("submit", clear);
    return () => form?.removeEventListener("submit", clear);
  }, [prefix]);
  return null;
}
