"use client";

import { useState } from "react";

const ENTRIES = [
  {
    q: "wat dis?",
    a: "unified expense tracker for crypto cards. currently supporting etherfi, plasma and gnosispay",
  },
  {
    q: "dis private?",
    a: "yes, stored locally in your browser",
  },
];

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="flex flex-col gap-3 text-sm">
      <h2 className="text-neutral-400">FAQ</h2>
      {ENTRIES.map(({ q, a }, i) => {
        const open = openIndex === i;
        return (
          <div key={q}>
            <button
              onClick={() => setOpenIndex(open ? null : i)}
              className="text-neutral-300 text-left hover:text-neutral-100"
            >
              {open ? "[-]" : "[+]"} Q: {q}
            </button>
            {open && <p className="text-neutral-500 mt-1">A: {a}</p>}
          </div>
        );
      })}
    </section>
  );
}
