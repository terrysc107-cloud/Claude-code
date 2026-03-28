"""Vercel serverless function: POST /api/exchange_token — exchanges public_token for access_token and stores in Supabase."""

import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import HTTPError


PLAID_ENVS = {
    "sandbox": "https://sandbox.plaid.com",
    "development": "https://development.plaid.com",
    "production": "https://production.plaid.com",
}


def supabase_insert(table, row):
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_KEY", "")
    req = Request(
        f"{url}/rest/v1/{table}",
        data=json.dumps(row).encode(),
        headers={
            "Content-Type": "application/json",
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Prefer": "return=minimal",
        },
        method="POST",
    )
    with urlopen(req, timeout=15) as resp:
        return resp.status


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        plaid_env = os.environ.get("PLAID_ENV", "sandbox").lower()
        base_url = PLAID_ENVS.get(plaid_env, PLAID_ENVS["sandbox"])
        client_id = os.environ.get("PLAID_CLIENT_ID", "")
        secret = os.environ.get("PLAID_SECRET", "")

        content_length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(content_length)) if content_length else {}
        public_token = body.get("public_token", "")

        if not public_token:
            self._json_response(400, {"error": "Missing public_token"})
            return

        payload = json.dumps({
            "client_id": client_id,
            "secret": secret,
            "public_token": public_token,
        }).encode()

        try:
            req = Request(
                f"{base_url}/item/public_token/exchange",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())

            access_token = data["access_token"]
            item_id = data.get("item_id", "")

            supabase_insert("plaid_tokens", {
                "item_id": item_id,
                "access_token": access_token,
                "cursor": "",
            })

            self._json_response(200, {"success": True, "item_id": item_id})

        except HTTPError as e:
            body = json.loads(e.read())
            self._json_response(e.code, {"error": body.get("error_message", str(body))})
        except Exception as e:
            self._json_response(500, {"error": str(e)})

    def do_OPTIONS(self):
        self._cors_headers()
        self.send_response(200)
        self.end_headers()

    def _json_response(self, status, data):
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
