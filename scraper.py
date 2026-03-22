"""
Philadelphia Absentee Owner Lead Scraper
========================================
Pulls property records from the Philadelphia Office of Property Assessment (OPA)
open data API and identifies absentee owners who likely rent out their properties.

Data source: https://data.phila.gov/resource/ub8h-6ry8.json
             (OPA Properties Public dataset — no API key required)

Absentee owner logic
--------------------
A property owner is flagged as "absentee" when the owner's mailing address
differs from the property address, meaning they don't live at the property.
This strongly correlates with rental ownership.

Additional rental-likelihood signals
-------------------------------------
  - Out-of-state mailing address (investor landlord)
  - Out-of-Philadelphia mailing address within PA
  - Multi-family property type (duplex, triplex, apt building)
  - High bedroom count relative to property type

Usage
-----
    python scraper.py [--limit N] [--out FILE] [--min-score N] [--token TOKEN]

    --limit N       Max records to pull from OPA (default: 50000, 0 = all)
    --out FILE      Output CSV path (default: philly_absentee_leads.csv)
    --min-score N   Minimum rental-likelihood score to include (default: 1)
    --token TOKEN   Socrata app token to avoid IP throttling (optional).
                    Can also be set via SOCRATA_APP_TOKEN env var.
                    Get one free at https://data.phila.gov/profile/app_tokens
    --no-progress   Disable progress bar
"""

import argparse
import csv
import logging
import os
import sys
import time
from typing import Any

import requests
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OPA_API_URL = "https://data.phila.gov/resource/ub8h-6ry8.json"

# Socrata page size (max 1000 per request)
PAGE_SIZE = 1000

# OPA category codes that indicate residential / rental use
#   1 = Residential
#   2 = Hotels & Apartments
#   3 = Store with Dwelling (mixed-use)
RENTAL_CATEGORY_CODES = {"1", "2", "3"}

# Building codes that strongly indicate multi-unit / rental use
# Philadelphia OPA building code descriptions (partial list):
#   A  = Row home / townhouse
#   B  = Twin / semi-detached
#   C  = Detached
#   H  = Mixed-use / commercial with residential
#   I  = Industrial with residential
#   R  = Row w/ garage
#   S  = Single family
#   D  = Detached garage
#   P  = Parking
# Multi-family indicators:
MULTIFAMILY_BUILDING_CODES = {
    "C2",  # Semi-det 2-story
    "C3",  # Semi-det 3-story
    "I1",  # Store/office with 1 apt
    "I2",  # Store/office with 2 apts
    "I3",  # Store/office with 3+ apts
    "H1",  # Conv. apt 3-unit
    "H2",  # Conv. apt 4–6 unit
    "H3",  # Conv. apt 7+ unit
    "G1",  # Det. w/ 1 comm unit
    "G2",  # Det. w/ 2 comm units
    "W1",  # Rooming house
    "W2",  # Large rooming house
}

# Socrata $where filter — pull only residential/hotel/mixed-use properties
WHERE_CLAUSE = "category_code IN('1','2','3')"

# Fields we actually need (reduces payload size)
SELECT_FIELDS = ",".join([
    "parcel_number",
    "location",
    "unit",
    "zip_code",
    "owner_1",
    "owner_2",
    "mailing_address_1",
    "mailing_address_2",
    "mailing_care_of",
    "mailing_city",
    "mailing_state",
    "mailing_zip",
    "building_code",
    "building_code_description",
    "category_code",
    "category_code_description",
    "number_of_bedrooms",
    "number_of_rooms",
    "number_stories",
    "total_area",
    "total_livable_area",
    "market_value",
    "year_built",
    "homestead_exemption",
])

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Fetching
# ---------------------------------------------------------------------------

def fetch_page(session: requests.Session, offset: int, limit: int) -> list[dict]:
    """Fetch one page of OPA records."""
    params: dict[str, Any] = {
        "$limit": min(PAGE_SIZE, limit) if limit else PAGE_SIZE,
        "$offset": offset,
        "$where": WHERE_CLAUSE,
        "$select": SELECT_FIELDS,
        "$order": "parcel_number ASC",
    }
    for attempt in range(5):
        try:
            resp = session.get(OPA_API_URL, params=params, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except (requests.RequestException, ValueError) as exc:
            if attempt == 4:
                raise
            wait = 2 ** attempt
            log.warning("Request failed (%s). Retrying in %ds…", exc, wait)
            time.sleep(wait)
    return []


def fetch_all(
    max_records: int = 50_000,
    show_progress: bool = True,
    app_token: str | None = None,
) -> list[dict]:
    """Pull all matching OPA records with pagination."""
    session = requests.Session()
    headers: dict[str, str] = {"Accept": "application/json"}
    if app_token:
        headers["X-App-Token"] = app_token
        log.info("Using Socrata app token (throttle limits lifted).")
    else:
        log.warning(
            "No Socrata app token provided. Requests may be throttled on large pulls. "
            "Set --token or SOCRATA_APP_TOKEN to avoid this."
        )
    session.headers.update(headers)

    records: list[dict] = []
    offset = 0
    pbar = tqdm(
        desc="Fetching OPA records",
        unit=" records",
        disable=not show_progress,
    )

    while True:
        remaining = (max_records - offset) if max_records else PAGE_SIZE
        if remaining <= 0:
            break
        page = fetch_page(session, offset, remaining)
        if not page:
            break
        records.extend(page)
        pbar.update(len(page))
        offset += len(page)
        if len(page) < PAGE_SIZE:
            break  # last page

    pbar.close()
    log.info("Fetched %d raw OPA records.", len(records))
    return records


# ---------------------------------------------------------------------------
# Absentee / rental scoring
# ---------------------------------------------------------------------------

def normalise(value: str | None) -> str:
    """Lowercase and strip whitespace."""
    return (value or "").strip().lower()


def is_absentee(record: dict) -> bool:
    """
    Return True when the owner's mailing address is different from the
    property address — the primary signal of an absentee (non-resident) owner.
    """
    prop_street = normalise(record.get("location"))
    mail_street = normalise(record.get("mailing_address_1"))

    if not prop_street or not mail_street:
        return False

    # Remove common noise so "123 MAIN ST" == "123 Main St"
    return prop_street != mail_street


def rental_score(record: dict) -> int:
    """
    Score 0–5 indicating how likely this absentee-owned property is a rental.

    Points are additive:
      +2  Out-of-state owner (strong investor signal)
      +1  Out-of-Philadelphia but in-state owner
      +1  Multi-family building code
      +1  Multi-unit category (hotels/apartments or mixed-use)
      +1  4+ bedrooms (common in student / multi-tenant rentals)
      -1  Has homestead exemption (owner-occupied indicator — reduces score)
    """
    score = 0

    mail_state = normalise(record.get("mailing_state"))
    mail_city = normalise(record.get("mailing_city"))
    building_code = (record.get("building_code") or "").strip().upper()
    category_code = str(record.get("category_code") or "").strip()
    homestead = str(record.get("homestead_exemption") or "0").strip()

    # Out-of-state owner
    if mail_state and mail_state not in ("pa", ""):
        score += 2
    # Out-of-city but still PA
    elif mail_state == "pa" and mail_city and mail_city not in ("philadelphia", "phila", "phila."):
        score += 1

    # Multi-family building code
    if building_code in MULTIFAMILY_BUILDING_CODES:
        score += 1

    # Hotel / apartment or mixed-use category
    if category_code in ("2", "3"):
        score += 1

    # High bedroom count → multi-tenant
    try:
        bedrooms = int(record.get("number_of_bedrooms") or 0)
        if bedrooms >= 4:
            score += 1
    except (ValueError, TypeError):
        pass

    # Homestead exemption → likely primary residence, not rental
    try:
        if float(homestead) > 0:
            score -= 1
    except (ValueError, TypeError):
        pass

    return max(score, 0)


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

OUTPUT_FIELDS = [
    "parcel_number",
    "property_address",
    "unit",
    "property_zip",
    "owner_1",
    "owner_2",
    "mailing_address",
    "mailing_city",
    "mailing_state",
    "mailing_zip",
    "building_code",
    "building_code_description",
    "category",
    "bedrooms",
    "total_area_sqft",
    "market_value",
    "year_built",
    "absentee_type",
    "rental_likelihood_score",
]


def build_lead(record: dict, score: int) -> dict:
    """Flatten an OPA record into a lead dict."""
    mail_state = normalise(record.get("mailing_state"))

    if mail_state and mail_state not in ("pa", ""):
        absentee_type = "Out-of-state"
    elif mail_state == "pa" and normalise(record.get("mailing_city")) not in (
        "philadelphia", "phila", "phila.", ""
    ):
        absentee_type = "Out-of-city (PA)"
    else:
        absentee_type = "Local absentee"

    mailing_parts = filter(None, [
        record.get("mailing_care_of"),
        record.get("mailing_address_1"),
        record.get("mailing_address_2"),
    ])

    return {
        "parcel_number": record.get("parcel_number", ""),
        "property_address": record.get("location", ""),
        "unit": record.get("unit", ""),
        "property_zip": record.get("zip_code", ""),
        "owner_1": record.get("owner_1", ""),
        "owner_2": record.get("owner_2", ""),
        "mailing_address": " ".join(mailing_parts).strip(),
        "mailing_city": record.get("mailing_city", ""),
        "mailing_state": record.get("mailing_state", ""),
        "mailing_zip": record.get("mailing_zip", ""),
        "building_code": record.get("building_code", ""),
        "building_code_description": record.get("building_code_description", ""),
        "category": record.get("category_code_description", ""),
        "bedrooms": record.get("number_of_bedrooms", ""),
        "total_area_sqft": record.get("total_area", ""),
        "market_value": record.get("market_value", ""),
        "year_built": record.get("year_built", ""),
        "absentee_type": absentee_type,
        "rental_likelihood_score": score,
    }


def write_csv(leads: list[dict], path: str) -> None:
    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(leads)
    log.info("Saved %d leads → %s", len(leads), path)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scrape Philadelphia OPA data for absentee-owner rental leads."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=50_000,
        metavar="N",
        help="Max OPA records to fetch (0 = all, default: 50000).",
    )
    parser.add_argument(
        "--out",
        default="philly_absentee_leads.csv",
        metavar="FILE",
        help="Output CSV file path (default: philly_absentee_leads.csv).",
    )
    parser.add_argument(
        "--min-score",
        type=int,
        default=1,
        dest="min_score",
        metavar="N",
        help="Minimum rental-likelihood score to include (0–5, default: 1).",
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("SOCRATA_APP_TOKEN"),
        metavar="TOKEN",
        help=(
            "Socrata app token to lift IP throttling. "
            "Defaults to SOCRATA_APP_TOKEN env var. "
            "Free registration: https://data.phila.gov/profile/app_tokens"
        ),
    )
    parser.add_argument(
        "--no-progress",
        action="store_true",
        help="Disable the tqdm progress bar.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    log.info("Starting Philadelphia absentee owner scraper.")
    log.info("Fetching up to %s records from OPA API…",
             f"{args.limit:,}" if args.limit else "all")

    records = fetch_all(
        max_records=args.limit,
        show_progress=not args.no_progress,
        app_token=args.token,
    )

    if not records:
        log.error("No records returned from API. Exiting.")
        sys.exit(1)

    leads: list[dict] = []
    absentee_count = 0

    for rec in records:
        if not is_absentee(rec):
            continue
        absentee_count += 1
        score = rental_score(rec)
        if score >= args.min_score:
            leads.append(build_lead(rec, score))

    # Sort: highest rental-likelihood score first, then by market value desc
    leads.sort(
        key=lambda r: (
            -int(r["rental_likelihood_score"]),
            -(float(r["market_value"]) if r["market_value"] else 0),
        )
    )

    log.info(
        "Results: %d total records → %d absentee owners → %d leads (score ≥ %d)",
        len(records),
        absentee_count,
        len(leads),
        args.min_score,
    )

    if not leads:
        log.warning("No leads matched the criteria. Try lowering --min-score.")
        sys.exit(0)

    # Print summary breakdown
    score_counts: dict[int, int] = {}
    type_counts: dict[str, int] = {}
    for lead in leads:
        s = lead["rental_likelihood_score"]
        t = lead["absentee_type"]
        score_counts[s] = score_counts.get(s, 0) + 1
        type_counts[t] = type_counts.get(t, 0) + 1

    print("\n── Score distribution ──────────────────")
    for score in sorted(score_counts, reverse=True):
        print(f"  Score {score}: {score_counts[score]:>6,} leads")

    print("\n── Absentee type breakdown ─────────────")
    for atype, count in sorted(type_counts.items(), key=lambda x: -x[1]):
        print(f"  {atype:<25} {count:>6,} leads")

    print()
    write_csv(leads, args.out)
    log.info("Done.")


if __name__ == "__main__":
    main()
