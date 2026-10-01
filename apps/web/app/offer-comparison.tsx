"use client";

import { useState } from "react";
import type { ComparedPartOffer } from "@li-erikes/domain/part-offers";
import { Icon } from "./icons";

const formatSek = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});

const formatStockTime = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Stockholm",
});

function money(minorUnits: number): string {
  return formatSek.format(minorUnits / 100);
}

function deliveredPrice(offer: ComparedPartOffer): string {
  return offer.deliveredPriceMinor === null
    ? "Unavailable"
    : money(offer.deliveredPriceMinor);
}

function deliveryLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days`;
}

function OfferCard({
  offer,
  selected,
  fastest,
  onSelect,
}: {
  offer: ComparedPartOffer;
  selected: boolean;
  fastest: boolean;
  onSelect: () => void;
}) {
  const badges = [
    offer.rank === 1 ? "Lowest total" : null,
    fastest ? "Fastest" : null,
  ].filter((badge): badge is string => badge !== null);

  return (
    <article className={`offer-card${selected ? " is-selected" : ""}`}>
      <div className="offer-card-top">
        <div aria-hidden="true" className="supplier-mark">
          {offer.supplier.slice(0, 1)}
        </div>
        <div className="supplier-details">
          <h3>{offer.supplier}</h3>
          <span>Illustrative supplier quote</span>
        </div>
        <span className="rank-number">
          {String(offer.rank ?? "—").padStart(2, "0")}
        </span>
      </div>

      {badges.length > 0 && (
        <div aria-label="Offer highlights" className="offer-badges">
          {badges.map((badge) => (
            <span
              className={`offer-badge${badge === "Lowest total" ? " badge-value" : ""}`}
              key={badge}
            >
              {badge}
            </span>
          ))}
        </div>
      )}

      <div className="offer-total">
        <span>Total with delivery</span>
        <strong>{deliveredPrice(offer)}</strong>
        <small>
          {money(offer.priceMinor)} part <span>+</span>{" "}
          {money(offer.shippingMinor)} delivery
        </small>
      </div>

      <div className="offer-facts">
        <div>
          <span>DELIVERY</span>
          <strong>{deliveryLabel(offer.deliveryDays)}</strong>
        </div>
        <div>
          <span>AVAILABILITY</span>
          <strong className="in-stock">
            <i aria-hidden="true" /> In stock
          </strong>
        </div>
      </div>

      <div className="fitment-line">
        <span className="check-mark">
          <Icon name="check" />
        </span>
        <span>Vehicle fitment confirmed</span>
      </div>

      <div className="offer-source">
        <span>Part {offer.partNumber}</span>
        <span>
          Checked {formatStockTime.format(new Date(offer.observedAt))}
        </span>
      </div>

      <button
        aria-pressed={selected}
        className={`select-offer${selected ? " selected-button" : ""}`}
        onClick={onSelect}
        type="button"
      >
        {selected ? "Selected for review" : "Choose for garage review"}
        {!selected && <Icon name="arrow" />}
      </button>
    </article>
  );
}

export function OfferComparison({
  rankedOffers,
  excludedOffers,
}: {
  rankedOffers: ComparedPartOffer[];
  excludedOffers: ComparedPartOffer[];
}) {
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [reviewQueued, setReviewQueued] = useState(false);
  const selectedOffer = rankedOffers.find(
    (offer) => offer.id === selectedOfferId,
  );
  const fastestDays = Math.min(
    ...rankedOffers.map((offer) => offer.deliveryDays),
  );

  function selectOffer(id: string) {
    setSelectedOfferId(id);
    setReviewQueued(false);
  }

  return (
    <>
      <section aria-labelledby="offers-title" className="offers-section">
        <div className="section-heading">
          <div>
            <div className="section-title-line">
              <h2 id="offers-title">Available offers</h2>
              <span className="offer-count">{rankedOffers.length}</span>
            </div>
            <p>
              Compatible, in-stock offers ranked by total price including
              delivery.
            </p>
          </div>
          <span className="sort-label">
            SORTED BY <strong>LOWEST TOTAL</strong>
          </span>
        </div>

        <div className="offer-grid">
          {rankedOffers.map((offer) => (
            <OfferCard
              fastest={offer.deliveryDays === fastestDays}
              key={offer.id}
              offer={offer}
              onSelect={() => selectOffer(offer.id)}
              selected={offer.id === selectedOfferId}
            />
          ))}
        </div>
      </section>

      {excludedOffers.length > 0 && (
        <details className="excluded-offers">
          <summary>
            <span>
              <strong>
                {excludedOffers.length} offer
                {excludedOffers.length === 1 ? "" : "s"} excluded
              </strong>
              <small>
                Offers with unconfirmed fitment or stale stock stay out of the
                ranking.
              </small>
            </span>
            <span className="excluded-toggle">See why</span>
          </summary>
          <div className="excluded-list">
            {excludedOffers.map((offer) => (
              <div className="excluded-row" key={offer.id}>
                <strong>{offer.supplier}</strong>
                <span>{offer.reason}</span>
                <span>{deliveredPrice(offer)} total</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <section className="garage-handoff">
        <div className="handoff-copy" aria-live="polite">
          <span
            className={`handoff-icon${reviewQueued ? " handoff-complete" : ""}`}
          >
            <Icon name={reviewQueued ? "check" : "arrow"} />
          </span>
          <div>
            <p className="eyebrow">GARAGE HANDOFF</p>
            <h2>
              {reviewQueued
                ? "Awaiting garage review"
                : selectedOffer
                  ? "Offer ready for review"
                  : "Choose an offer to continue"}
            </h2>
            <p>
              {reviewQueued
                ? "Marked in this demo only. No message was sent and no order was placed."
                : "The garage reviews the supplier, total and delivery estimate before any purchase."}
            </p>
          </div>
        </div>

        <div className="handoff-selection">
          <span>SELECTED OFFER</span>
          {selectedOffer ? (
            <strong>
              {selectedOffer.supplier} <i>·</i> {deliveredPrice(selectedOffer)}
            </strong>
          ) : (
            <strong className="selection-placeholder">None selected</strong>
          )}
        </div>

        <button
          className="handoff-button"
          disabled={!selectedOffer || reviewQueued}
          onClick={() => setReviewQueued(true)}
          type="button"
        >
          {reviewQueued ? "Marked for review" : "Mark for garage review"}
          {!reviewQueued && <Icon name="arrow" />}
        </button>
      </section>

      <p className="ranking-note">
        Ranking rule: confirmed vehicle fitment, confirmed stock and a recent
        supplier update are required. Eligible offers sort by delivered price,
        then delivery time.
      </p>
    </>
  );
}
