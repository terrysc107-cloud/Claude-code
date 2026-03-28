"""Vercel serverless function: POST /api/create_link_token — creates a Plaid link_token."""

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


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        plaid_env = os.environ.get("PLAID_ENV", "sandbox").lower()
        base_url = PLAID_ENVS.get(plaid_env, PLAID_ENVS["sandbox"])
        client_id = os.environ.get("PLAID_CLIENT_ID", "")
        secret = os.environ.get("PLAID_SECRET", "")

        if not client_id or not secret:
            self._json_response(500, {"error": "Missing Plaid credentials"})
            return

        payload = json.dumps({
            "client_id": client_id,
            "secret": secret,
            "user": {"client_user_id": "plaid-finance-user"},
            "client_name": "Finance Dashboard",
            "products": ["transactions"],
            "country_codes": ["US"],
            "language": "en",
        }).encode()

        try:
            req = Request(
                f"{base_url}/link/token/create",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
                self._json_response(200, {"link_token": data["link_token"]})
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
