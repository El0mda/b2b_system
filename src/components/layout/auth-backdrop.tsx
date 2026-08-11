// Decorative background for auth screens — soft brand-color glow plus a
// dot-spiral motif echoing the logo mark. Purely visual; kept out of the
// tab order and hidden from assistive tech.
export function AuthBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-grid opacity-[0.4] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />

      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-cyan/25 blur-3xl dark:bg-brand-cyan/15" />
      <div className="absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-primary/20 blur-3xl dark:bg-primary/10" />

      <svg
        className="absolute right-[8%] top-[12%] hidden h-40 w-40 text-brand-cyan/30 sm:block lg:right-[15%]"
        viewBox="0 0 100 100"
        fill="currentColor"
      >
        {Array.from({ length: 26 }).map((_, i) => {
          const angle = (i / 26) * Math.PI * 2.2;
          const radius = 8 + i * 1.55;
          const cx = 50 + Math.cos(angle) * radius;
          const cy = 50 + Math.sin(angle) * radius;
          const r = 1 + (i / 26) * 2.4;
          return <circle key={i} cx={cx} cy={cy} r={r} />;
        })}
      </svg>
    </div>
  );
}
