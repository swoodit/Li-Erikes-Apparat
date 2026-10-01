import {
  comparePartOffers,
  type PartOfferCandidate,
} from "@li-erikes/domain/part-offers";
import { OfferComparison } from "./offer-comparison";
import { Icon } from "./icons";

const comparisonTime = new Date("2026-09-29T12:00:00.000Z");
const sampleCandidates: PartOfferCandidate[] = [
  {
    id: "northline",
    supplier: "Northline Parts",
    partNumber: "BP-8421-F",
    priceMinor: 114_900,
    shippingMinor: 8_900,
    fitment: "confirmed",
    availability: "in_stock",
    deliveryDays: 2,
    observedAt: "2026-09-29T11:52:00.000Z",
    source: "sample",
  },
  {
    id: "västerås-auto",
    supplier: "Västerås Auto Supply",
    partNumber: "BP-8421-F",
    priceMinor: 127_900,
    shippingMinor: 0,
    fitment: "confirmed",
    availability: "in_stock",
    deliveryDays: 1,
    observedAt: "2026-09-29T11:49:00.000Z",
    source: "sample",
  },
  {
    id: "orbit-motor",
    supplier: "Orbit Motor",
    partNumber: "BP-8421-F",
    priceMinor: 109_900,
    shippingMinor: 14_900,
    fitment: "confirmed",
    availability: "in_stock",
    deliveryDays: 0,
    observedAt: "2026-09-29T11:55:00.000Z",
    source: "sample",
  },
  {
    id: "euro-spares",
    supplier: "Euro Spares",
    partNumber: "BP-8421-F",
    priceMinor: 98_900,
    shippingMinor: 0,
    fitment: "unknown",
    availability: "in_stock",
    deliveryDays: 1,
    observedAt: "2026-09-29T11:53:00.000Z",
    source: "sample",
  },
];

const offers = comparePartOffers(sampleCandidates, comparisonTime, 180);
const rankedOffers = offers.filter((offer) => offer.rank !== null);
const excludedOffers = offers.filter((offer) => offer.rank === null);

export default function HomePage() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <a aria-label="Li-Erikes Apparat home" className="brand" href="#top">
          <span className="brand-symbol">
            L<span>i</span>
          </span>
          <span className="brand-name">
            Li-Erikes Apparat
            <small>WORKSHOP HUB</small>
          </span>
        </a>

        <div className="workspace-nav">
          <span>Work orders</span>
          <span aria-current="page" className="nav-current">
            Parts requests
          </span>
          <span>Customers</span>
        </div>

        <div className="user-area">
          <span className="workshop-name">
            <i aria-hidden="true" /> Li-Erikes Verkstad
          </span>
          <span aria-hidden="true" className="avatar">
            LE
          </span>
        </div>
      </header>

      <main className="page-content" id="top">
        <nav aria-label="Breadcrumb" className="breadcrumbs">
          <a href="#request">Parts requests</a>
          <Icon name="chevron" />
          <strong>RQ-1042</strong>
        </nav>

        <section className="page-heading">
          <div>
            <p className="eyebrow">PARTS REQUEST · RQ-1042</p>
            <h1>Compare supplier offers</h1>
            <p className="page-intro">
              Review fit, delivered price and ETA before the garage approves a
              purchase.
            </p>
          </div>
          <span className="request-status">
            <i aria-hidden="true" /> Parts request open
          </span>
        </section>

        <aside className="sample-notice" role="note">
          <span className="notice-symbol">i</span>
          <div>
            <strong>Sample workflow</strong>
            <span>
              These illustrative offers are not live supplier data. Selecting an
              offer won’t place an order.
            </span>
          </div>
        </aside>

        <section
          aria-labelledby="request-title"
          className="request-card"
          id="request"
        >
          <div className="vehicle-icon">
            <Icon name="car" />
          </div>
          <div className="request-details">
            <p className="eyebrow">VEHICLE & REQUESTED WORK</p>
            <h2 id="request-title">2018 Volvo V60</h2>
            <p>
              Front brake pads <span>·</span> Part BP-8421-F
            </p>
          </div>
          <div className="request-divider" />
          <div className="fitment-summary">
            <span className="fitment-icon">
              <Icon name="check" />
            </span>
            <div>
              <strong>Fitment confirmed</strong>
              <span>Vehicle details verified</span>
            </div>
          </div>
          <div className="request-ref">
            <span>REQUEST</span>
            <strong>RQ-1042</strong>
          </div>
        </section>

        <OfferComparison
          excludedOffers={excludedOffers}
          rankedOffers={rankedOffers}
        />
      </main>

      <footer className="page-footer">
        <span>Li-Erikes Apparat</span>
        <span>Workshop workflow preview</span>
      </footer>
    </div>
  );
}
