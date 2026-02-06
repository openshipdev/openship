const principles = [
  {
    title: "Reproducibility over rhetoric",
    text: "If someone cannot run it and measure it, it is not truly shareable.",
  },
  {
    title: "Operational transparency",
    text: "Replace 'it works on my machine' with clear behavior in the wild.",
  },
  {
    title: "Metrics as a public interface",
    text: "Performance is a contract: baselines and regressions are part of the product.",
  },
  {
    title: "Design decisions are open",
    text: "Share not only what was built, but why, what was rejected, and what could change.",
  },
  {
    title: "Shipping is a team sport",
    text: "The community contributes to reliability, safety, and iteration speed, not only code.",
  },
  {
    title: "Responsible openness",
    text: "Share with discipline: redaction, privacy, security boundaries, and threat modeling.",
  },
];

export default function HomePage() {
  return (
    <main className="manifesto">
      <p className="eyebrow">The Open Ship Future</p>
      <h1>Open source shared code, open ship shares the loops</h1>

      <p>
        Open source won by sharing code. Open ship wins by publishing the whole delivery
        loop: prompts and behaviors, architecture decisions, evaluation harnesses, baseline
        metrics, deployment recipes, observability, and the operational playbooks that turn a
        project from a pile of files into a living system.
      </p>

      <p className="loop">Ship → Measure → Learn → Iterate</p>
    </main>
  );
}
