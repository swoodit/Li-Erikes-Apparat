type IconName = "arrow" | "car" | "check" | "chevron";

export function Icon({ name }: { name: IconName }) {
  const paths = {
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    car: (
      <>
        <path d="m5 11 1.4-4.2A2 2 0 0 1 8.3 5.5h7.4a2 2 0 0 1 1.9 1.3L19 11" />
        <path d="M3.5 11h17v7h-17zM6.5 18v1.5m11-1.5v1.5M6.8 14.5h.7m9 0h.7" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
  };

  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  );
}
