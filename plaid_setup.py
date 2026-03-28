"""
plaid_setup.py — Run once to create a Plaid sandbox item and persist the access_token.

Usage:
    python plaid_setup.py

Prerequisites:
    1. Copy .env.example to .env and fill in your Plaid sandbox credentials.
    2. pip install -r requirements.txt
"""

import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

STATE_FILE = Path("plaid_state.json")

PLAID_ENVS = {
    "sandbox": "https://sandbox.plaid.com",
    "development": "https://development.plaid.com",
    "production": "https://production.plaid.com",
}


def get_base_url() -> str:
    env = os.environ.get("PLAID_ENV", "sandbox").lower()
    if env not in PLAID_ENVS:
        print(f"ERROR: PLAID_ENV must be one of {list(PLAID_ENVS)}. Got: {env!r}")
        sys.exit(1)
    return PLAID_ENVS[env]


def load_credentials() -> tuple[str, str]:
    client_id = os.environ.get("PLAID_CLIENT_ID", "").strip()
    secret = os.environ.get("PLAID_SECRET", "").strip()
    if not client_id or not secret:
        print("ERROR: PLAID_CLIENT_ID and PLAID_SECRET must be set in .env")
        sys.exit(1)
    return client_id, secret


def plaid_post(base_url: str, path: str, payload: dict) -> dict:
    url = f"{base_url}{path}"
    resp = requests.post(url, json=payload, timeout=30)
    data = resp.json()
    if resp.status_code != 200:
        error = data.get("error_message", data.get("display_message", str(data)))
        print(f"ERROR calling {path}: {error}")
        sys.exit(1)
    return data


def main() -> None:
    # Guard: don't overwrite an existing access_token
    if STATE_FILE.exists():
        state = json.loads(STATE_FILE.read_text())
        if state.get("access_token"):
            print(
                f"plaid_state.json already contains an access_token.\n"
                f"Delete {STATE_FILE} to force re-setup, or run plaid_sync.py to sync."
            )
            sys.exit(0)

    base_url = get_base_url()
    client_id, secret = load_credentials()

    print("Creating sandbox public token...")
    pt_data = plaid_post(
        base_url,
        "/sandbox/public_token/create",
        {
            "client_id": client_id,
            "secret": secret,
            "institution_id": "ins_109508",
            "initial_products": ["transactions"],
            "options": {
                "override_username": "user_good",
                "override_password": "pass_good",
            },
        },
    )
    public_token = pt_data["public_token"]
    print(f"  public_token: {public_token[:20]}...")

    print("Exchanging public token for access token...")
    ex_data = plaid_post(
        base_url,
        "/item/public_token/exchange",
        {
            "client_id": client_id,
            "secret": secret,
            "public_token": public_token,
        },
    )
    access_token = ex_data["access_token"]
    item_id = ex_data.get("item_id", "")
    print(f"  access_token: {access_token[:20]}...")
    print(f"  item_id:      {item_id}")

    state = {
        "access_token": access_token,
        "item_id": item_id,
        "cursor": "",
        "last_sync": "",
    }
    STATE_FILE.write_text(json.dumps(state, indent=2))
    print(f"\nSaved state to {STATE_FILE}")
    print("\nNext step: run  python plaid_sync.py")


if __name__ == "__main__":
    main()
