"""
Philadelphia Absentee Owner Lead Scraper
========================================
Pulls property records from the Philadelphia Office of Property Assessment (OPA)
via the city's public Carto SQL API and identifies absentee owners who likely
rent out their properties.

Data source: https://phl.carto.com/api/v2/sql
Table:       opa_properties_public  (updates nightly, no API key required)
Info:        https://opendataphilly.org/datasets/philadelphia-properties-and-assessment-history/

NOTE on email / phone
---------------------
The OPA dataset contains owner name and mailing address ONLY.
Phone numbers and email addresses are not included — this is public
property-tax assessment data. To enrich leads with contact info, use a
skip-tracing service such as BatchSkipTracing, PropStream, or REISkip.

Absentee owner logic
--------------------
A property owner is flagged as "absentee" when the owner's mailing street
address differs from the property address (they don't live at the property).
This strongly correlates with rental ownership.

Additional rental-likelihood signals
-------------------------------------
  - Out-of-state mailing address (+2)
  - Out-of-Philadelphia, in-state mailing address (+1)
  - Multi-family / hotel / mixed-use building code (+1)
  - Hotel/apt or mixed-use category code (+1)
  - 4+ bedrooms (+1)
  - Has homestead exemption — owner-occupied indicator (-1)

Usage
-----
    python scraper.py [--limit N] [--zip ZIP ...] [--out FILE] [--min-score N]

    --limit N       Max records to fetch (default: 1000, 0 = all)
    --zip ZIP ...   Filter to specific zip codes (e.g. --zip 19143 19131 19139)
    --out FILE      Output CSV (default: philly_absentee_leads.csv)
    --min-score N   Minimum rental-likelihood score 0–5 (default: 0)
    --no-progress   Disable progress bar
"""

import argparse
import csv
import logging
import sys
import time
from typing import Any

import requests
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CARTO_SQL_URL = "https://phl.carto.com/api/v2/sql"
TABLE = "opa_properties_public"

# Carto page size
PAGE_SIZE = 1000

# category_code values for residential / rental / mixed-use
#   1 = Single Family / Residential
#   2 = Hotels & Apartments
#   3 = Store with Dwelling (mixed-use)
RENTAL_CATEGORIES = ("1", "2", "3")

# Building codes that indicate multi-unit / rental use
MULTIFAMILY_BUILDING_CODES = {
    "I1", "I2", "I3",   # store/office with 1/2/3+ apts
    "H1", "H2", "H3",   # converted apt 3-unit / 4-6 unit / 7+ unit
    "G1", "G2",          # detached with commercial units
    "W1", "W2",          # rooming houses
    "C2", "C3",          # semi-detached 2/3 story
}

# Fields to retrieve
SELECT_FIELDS = ", ".join([
    "parcel_number",
    "location",
    "unit",
    "zip_code",
    "owner_1",
    "owner_2",
    "mailing_street",
    "mailing_address_1",
    "mailing_address_2",
    "mailing_care_of",
    "mailing_city_state",
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
    "sale_date",
    "sale_price",
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

def build_where(zip_codes: list[str] | None) -> str:
    cats = ", ".join(f"'{c}'" for c in RENTAL_CATEGORIES)
    base = f"category_code IN ({cats})"
    if zip_codes:
        zips = ", ".join(f"'{z.strip()}'" for z in zip_codes)
        base += f" AND zip_code IN ({zips})"
    return base


def fetch_page(
    session: requests.Session,
    offset: int,
    page_size: int,
    where: str,
) -> list[dict]:
    """Fetch one page via Carto SQL API."""
    sql = (
        f"SELECT {SELECT_FIELDS} "
        f"FROM {TABLE} "
        f"WHERE {where} "
        f"ORDER BY parcel_number "
        f"LIMIT {page_size} OFFSET {offset}"
    )
    for attempt in range(5):
        try:
            resp = session.get(
                CARTO_SQL_URL,
                params={"q": sql, "format": "json"},
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json().get("rows", [])
        except (requests.RequestException, ValueError, KeyError) as exc:
            if attempt == 4:
                raise
            wait = 2 ** attempt
            log.warning("Request failed (%s). Retrying in %ds…", exc, wait)
            time.sleep(wait)
    return []


def fetch_all(
    max_records: int = 1_000,
    zip_codes: list[str] | None = None,
    show_progress: bool = True,
) -> list[dict]:
    """Pull OPA records with pagination."""
    session = requests.Session()
    session.headers.update({"Accept": "application/json"})

    where = build_where(zip_codes)
    if zip_codes:
        log.info("Zip code filter: %s", ", ".join(zip_codes))

    records: list[dict] = []
    offset = 0
    pbar = tqdm(desc="Fetching OPA records", unit=" recs", disable=not show_progress)

    while True:
        batch = min(PAGE_SIZE, max_records - offset) if max_records else PAGE_SIZE
        if batch <= 0:
            break
        page = fetch_page(session, offset, batch, where)
        if not page:
            break
        records.extend(page)
        pbar.update(len(page))
        offset += len(page)
        if len(page) < batch:
            break  # last page

    pbar.close()
    log.info("Fetched %d raw OPA records.", len(records))
    return records


# ---------------------------------------------------------------------------
# Absentee / rental scoring
# ---------------------------------------------------------------------------

def norm(value: Any) -> str:
    return str(value or "").strip().lower()


def is_absentee(rec: dict) -> bool:
    """
    True when owner mailing street ≠ property address.
    Uses mailing_street (the actual street line) vs location (property address).
    """
    prop = norm(rec.get("location"))
    mail = norm(rec.get("mailing_street") or rec.get("mailing_address_1"))
    if not prop or not mail:
        return False
    return prop != mail


def parse_city_state(city_state: str) -> tuple[str, str]:
    """
    Split 'PHILADELPHIA PA' → ('philadelphia', 'pa').
    Handles 'CITY ST' format — last token is state code.
    """
    parts = city_state.strip().split()
    if len(parts) >= 2:
        return " ".join(parts[:-1]).lower(), parts[-1].lower()
    return city_state.lower(), ""


def rental_score(rec: dict) -> int:
    score = 0

    city_state = norm(rec.get("mailing_city_state", ""))
    city, state = parse_city_state(city_state)
    building_code = str(rec.get("building_code") or "").strip().upper()
    category_code = str(rec.get("category_code") or "").strip()
    homestead = rec.get("homestead_exemption") or 0

    # Out-of-state owner
    if state and state != "pa":
        score += 2
    # Out-of-city but PA
    elif state == "pa" and city and city not in ("philadelphia", "phila", "phila."):
        score += 1

    # Multi-family building code
    if building_code in MULTIFAMILY_BUILDING_CODES:
        score += 1

    # Hotel/apt or mixed-use category
    if category_code in ("2", "3"):
        score += 1

    # 4+ bedrooms → multi-tenant
    try:
        if int(rec.get("number_of_bedrooms") or 0) >= 4:
            score += 1
    except (ValueError, TypeError):
        pass

    # Homestead exemption → likely primary residence
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
    "owner_mailing_street",
    "owner_mailing_city_state",
    "owner_mailing_zip",
    "building_code",
    "building_code_description",
    "category",
    "bedrooms",
    "total_area_sqft",
    "market_value",
    "last_sale_date",
    "last_sale_price",
    "year_built",
    "absentee_type",
    "rental_likelihood_score",
    "email",
    "phone",
]


def absentee_type(rec: dict) -> str:
    city_state = norm(rec.get("mailing_city_state", ""))
    city, state = parse_city_state(city_state)
    if state and state != "pa":
        return "Out-of-state"
    if state == "pa" and city and city not in ("philadelphia", "phila", "phila."):
        return "Out-of-city (PA)"
    return "Local absentee"


def build_lead(rec: dict, score: int) -> dict:
    mail_parts = [
        rec.get("mailing_care_of"),
        rec.get("mailing_street") or rec.get("mailing_address_1"),
        rec.get("mailing_address_2"),
    ]
    mail_street = " | ".join(p for p in mail_parts if p)

    return {
        "parcel_number": rec.get("parcel_number", ""),
        "property_address": rec.get("location", ""),
        "unit": rec.get("unit", "") or "",
        "property_zip": rec.get("zip_code", ""),
        "owner_1": rec.get("owner_1", ""),
        "owner_2": rec.get("owner_2", "") or "",
        "owner_mailing_street": mail_street,
        "owner_mailing_city_state": rec.get("mailing_city_state", ""),
        "owner_mailing_zip": rec.get("mailing_zip", ""),
        "building_code": rec.get("building_code", ""),
        "building_code_description": rec.get("building_code_description", ""),
        "category": rec.get("category_code_description", ""),
        "bedrooms": rec.get("number_of_bedrooms", "") or "",
        "total_area_sqft": rec.get("total_area", "") or "",
        "market_value": rec.get("market_value", "") or "",
        "last_sale_date": (rec.get("sale_date") or "")[:10],
        "last_sale_price": rec.get("sale_price", "") or "",
        "year_built": rec.get("year_built", "") or "",
        "absentee_type": absentee_type(rec),
        "rental_likelihood_score": score,
        # OPA data does not include contact info — use a skip-tracing service
        "email": "N/A - use skip tracing",
        "phone": "N/A - use skip tracing",
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
        "--limit", type=int, default=1_000, metavar="N",
        help="Max OPA records to fetch (0 = all, default: 1000).",
    )
    parser.add_argument(
        "--zip", nargs="+", metavar="ZIP", dest="zip_codes",
        help="Filter to zip codes (e.g. --zip 19143 19131 19139).",
    )
    parser.add_argument(
        "--out", default="philly_absentee_leads.csv", metavar="FILE",
        help="Output CSV path (default: philly_absentee_leads.csv).",
    )
    parser.add_argument(
        "--min-score", type=int, default=0, dest="min_score", metavar="N",
        help="Minimum rental-likelihood score 0–5 (default: 0).",
    )
    parser.add_argument(
        "--no-progress", action="store_true",
        help="Disable progress bar.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    log.info("Starting Philadelphia absentee owner scraper.")
    log.info("Fetching up to %s records…", f"{args.limit:,}" if args.limit else "all")

    records = fetch_all(
        max_records=args.limit,
        zip_codes=args.zip_codes,
        show_progress=not args.no_progress,
    )

    if not records:
        log.error("No records returned. Check your zip codes or try again.")
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

    leads.sort(key=lambda r: (
        -int(r["rental_likelihood_score"]),
        -(float(r["market_value"]) if r["market_value"] else 0),
    ))

    log.info(
        "Results: %d fetched → %d absentee owners → %d leads (score ≥ %d)",
        len(records), absentee_count, len(leads), args.min_score,
    )

    if not leads:
        log.warning("No leads matched. Try --min-score 0.")
        sys.exit(0)

    # Summary breakdown
    score_dist: dict[int, int] = {}
    type_dist: dict[str, int] = {}
    for lead in leads:
        s = int(lead["rental_likelihood_score"])
        t = lead["absentee_type"]
        score_dist[s] = score_dist.get(s, 0) + 1
        type_dist[t] = type_dist.get(t, 0) + 1

    print("\n── Score distribution ──────────────────")
    for s in sorted(score_dist, reverse=True):
        print(f"  Score {s}: {score_dist[s]:>5,} leads")

    print("\n── Absentee type ───────────────────────")
    for t, c in sorted(type_dist.items(), key=lambda x: -x[1]):
        print(f"  {t:<25} {c:>5,} leads")

    print(f"\n  NOTE: Email/phone not in OPA data.")
    print(f"  Use BatchSkipTracing, PropStream, or REISkip to enrich leads.\n")

    write_csv(leads, args.out)
    log.info("Done.")


if __name__ == "__main__":
    main()
