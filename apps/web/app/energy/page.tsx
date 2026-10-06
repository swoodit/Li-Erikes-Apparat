type PriceSlot = Readonly<{
  startsAt: string;
  total: number;
  currency: string;
  level: string | null;
}>;

type PriceWindow = Readonly<{
  minutes: number;
  startsAt: string;
  endsAt: string;
  average: number;
  minimum: number;
  maximum: number;
  currency: string;
}>;

type Advice = Readonly<{
  homeId: string;
  generatedAt: string;
  current: PriceSlot | null;
  recommendation: Readonly<{
    action: "run_now" | "wait" | "neutral";
    reason: string;
    currentPercentile: number | null;
    nextCheaperAt: string | null;
  }>;
  cheapestWindows: Readonly<{
    minutes30: PriceWindow | null;
    minutes60: PriceWindow | null;
    minutes120: PriceWindow | null;
  }>;
  cheapestSlots: readonly PriceSlot[];
  expensiveSlots: readonly PriceSlot[];
}>;

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm",
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Europe/Stockholm",
  }).format(new Date(value));
}

function money(value: number, currency = "SEK"): string {
  return new Intl.NumberFormat("sv-SE", {
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

async function loadAdvice(): Promise<
  | { ok: true; advice: Advice }
  | { ok: false; message: string }
> {
  const key = process.env.HOME_ENERGY_API_KEY?.trim();
  if (!key) {
    return { ok: false, message: "HOME_ENERGY_API_KEY is not configured for the web app." };
  }

  const apiBase =
    process.env.LI_ERIKES_API_URL?.trim() || "http://127.0.0.1:3001";

  try {
    const response = await fetch(`${apiBase}/api/energy/tibber/advice`, {
      cache: "no-store",
      headers: { "x-home-energy-key": key },
    });

    if (!response.ok) {
      return {
        ok: false,
        message: `Energy API returned HTTP ${response.status}.`,
      };
    }

    return { ok: true, advice: (await response.json()) as Advice };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Could not reach the Li-Erikes energy API.",
    };
  }
}

function signalCopy(action: Advice["recommendation"]["action"]) {
  if (action === "run_now") return { title: "RUN NOW", detail: "Current price is favourable." };
  if (action === "wait") return { title: "WAIT", detail: "A cheaper window is ahead." };
  return { title: "NEUTRAL", detail: "No strong price signal right now." };
}

export const dynamic = "force-dynamic";

export default async function EnergyPage() {
  const result = await loadAdvice();

  if (!result.ok) {
    return (
      <div className="energy-shell">
        <header className="energy-topbar">
          <a className="energy-brand" href="/">Li-Erikes Apparat</a>
          <nav>
            <a href="/">Workshop</a>
            <a aria-current="page" href="/energy">Energy</a>
          </nav>
        </header>
        <main className="energy-page">
          <section className="energy-error">
            <p className="eyebrow">HOME ENERGY</p>
            <h1>Energy dashboard unavailable</h1>
            <p>{result.message}</p>
          </section>
        </main>
      </div>
    );
  }

  const { advice } = result;
  const signal = signalCopy(advice.recommendation.action);
  const windows = [
    advice.cheapestWindows.minutes30,
    advice.cheapestWindows.minutes60,
    advice.cheapestWindows.minutes120,
  ].filter((window): window is PriceWindow => window !== null);

  return (
    <div className="energy-shell">
      <header className="energy-topbar">
        <a className="energy-brand" href="/">Li-Erikes Apparat</a>
        <nav>
          <a href="/">Workshop</a>
          <a aria-current="page" href="/energy">Energy</a>
        </nav>
      </header>

      <main className="energy-page">
        <section className="energy-heading">
          <div>
            <p className="eyebrow">LI-ERIKES GÅRD · HOME ENERGY</p>
            <h1>Energy intelligence</h1>
            <p className="energy-intro">
              Tibber price data turned into practical timing decisions.
            </p>
          </div>
          <a className="refresh-link" href="/energy">Refresh</a>
        </section>

        <section className="energy-hero-grid">
          <article className="price-card">
            <span className="energy-label">CURRENT PRICE</span>
            <strong>
              {advice.current
                ? money(advice.current.total, advice.current.currency)
                : "—"}
            </strong>
            <small>per kWh</small>
            {advice.current?.level ? (
              <span className="price-level">{advice.current.level.replaceAll("_", " ")}</span>
            ) : null}
          </article>

          <article className={`signal-card signal-${advice.recommendation.action}`}>
            <span className="energy-label">RECOMMENDATION</span>
            <strong>{signal.title}</strong>
            <p>{signal.detail}</p>
            {advice.recommendation.currentPercentile !== null ? (
              <small>
                Current slot percentile: {advice.recommendation.currentPercentile}%
              </small>
            ) : null}
          </article>
        </section>

        <section className="energy-section">
          <div className="energy-section-heading">
            <div>
              <p className="eyebrow">BEST CONTIGUOUS WINDOWS</p>
              <h2>Cheapest time to run</h2>
            </div>
          </div>

          <div className="window-grid">
            {windows.map((window) => (
              <article className="window-card" key={window.minutes}>
                <span>{window.minutes} MIN</span>
                <strong>
                  {formatTime(window.startsAt)}–{formatTime(window.endsAt)}
                </strong>
                <p>{money(window.average, window.currency)} avg/kWh</p>
                <small>
                  Range {money(window.minimum, window.currency)}–{money(window.maximum, window.currency)}
                </small>
              </article>
            ))}
          </div>
        </section>

        <section className="energy-two-column">
          <div>
            <div className="energy-section-heading compact">
              <div>
                <p className="eyebrow">CHEAPEST</p>
                <h2>Upcoming slots</h2>
              </div>
            </div>
            <div className="slot-list">
              {advice.cheapestSlots.map((slot) => (
                <div className="slot-row" key={slot.startsAt}>
                  <span>{formatDateTime(slot.startsAt)}</span>
                  <strong>{money(slot.total, slot.currency)}</strong>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="energy-section-heading compact">
              <div>
                <p className="eyebrow">EXPENSIVE</p>
                <h2>Avoid these slots</h2>
              </div>
            </div>
            <div className="slot-list">
              {advice.expensiveSlots.map((slot) => (
                <div className="slot-row" key={slot.startsAt}>
                  <span>{formatDateTime(slot.startsAt)}</span>
                  <strong>{money(slot.total, slot.currency)}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <p className="energy-updated">
          Updated {formatDateTime(advice.generatedAt)}
        </p>
      </main>
    </div>
  );
}
