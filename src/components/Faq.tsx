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
  return (
    <section className="flex flex-col gap-3 text-sm">
      <h2 className="text-neutral-400">FAQ</h2>
      {ENTRIES.map(({ q, a }) => (
        <div key={q}>
          <p className="text-neutral-300">Q: {q}</p>
          <p className="text-neutral-500">A: {a}</p>
        </div>
      ))}
    </section>
  );
}
