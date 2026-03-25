from __future__ import annotations

import hashlib
import hmac
import os
import time
import uuid
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field

from browser_use.mcp.server import BrowserUseServer


class Envelope(BaseModel):
    agentId: str = Field(min_length=1, max_length=128)
    runId: str = Field(min_length=1, max_length=128)
    taskKey: str | None = None
    toolInput: dict[str, Any]
    traceId: str | None = None


app = FastAPI(title="paperclip-browser-use-service")
server = BrowserUseServer(session_timeout_minutes=10)


def _resolve_headless(tool_input: dict[str, Any]) -> bool:
    """與 Paperclip gateway 的 PAPERCLIP_BROWSER_USE_DEBUG 一致：debug 開啟時顯示瀏覽器（headless=False）。"""
    raw = tool_input.get("headless")
    if raw is not None:
        return bool(raw)
    debug = os.getenv("PAPERCLIP_BROWSER_USE_DEBUG", "").strip().lower() in ("1", "true", "yes")
    return not debug


def _verify_signature(
    body: bytes,
    signature: str | None,
    timestamp: str | None,
    nonce: str | None,
    token: str | None,
) -> None:
    expected_token = os.getenv("PAPERCLIP_BROWSER_USE_SERVICE_TOKEN", "").strip()
    if expected_token and token != expected_token:
        raise HTTPException(status_code=401, detail="invalid service token")

    secret = os.getenv("PAPERCLIP_BROWSER_USE_SERVICE_SECRET", "").strip()
    if not secret:
        raise HTTPException(status_code=500, detail="service secret not configured")
    if not signature or not timestamp or not nonce:
        raise HTTPException(status_code=401, detail="missing signature headers")

    try:
        ts = int(timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="invalid timestamp") from exc
    if abs(int(time.time() * 1000) - ts) > 5 * 60 * 1000:
        raise HTTPException(status_code=401, detail="stale signature timestamp")

    payload = f"{timestamp}.{nonce}.".encode("utf-8") + body
    digest = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(digest, signature):
        raise HTTPException(status_code=401, detail="signature mismatch")


async def _handle(tool_name: str, env: Envelope) -> dict[str, Any]:
    trace_id = env.traceId or str(uuid.uuid4())
    try:
        result = await server._execute_tool(tool_name, env.toolInput)
        return {"ok": True, "data": result, "error": None, "traceId": trace_id}
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "data": None,
            "error": {
                "code": "BROWSER_TOOL_EXECUTION_FAILED",
                "message": str(exc),
                "retryable": False,
            },
            "traceId": trace_id,
        }


@app.post("/v1/sessions/start")
async def sessions_start(
    env: Envelope,
    request: Request,
    x_tool_signature: str | None = Header(default=None),
    x_tool_timestamp: str | None = Header(default=None),
    x_tool_nonce: str | None = Header(default=None),
    x_tool_token: str | None = Header(default=None),
):
    _verify_signature(await request.body(), x_tool_signature, x_tool_timestamp, x_tool_nonce, x_tool_token)
    await server._init_browser_session(
        allowed_domains=env.toolInput.get("allowedDomains"),
        headless=_resolve_headless(env.toolInput),
    )
    return await _handle("browser_list_sessions", env)


@app.post("/v1/navigate")
async def navigate(env: Envelope, request: Request, x_tool_signature: str | None = Header(default=None), x_tool_timestamp: str | None = Header(default=None), x_tool_nonce: str | None = Header(default=None), x_tool_token: str | None = Header(default=None)):
    _verify_signature(await request.body(), x_tool_signature, x_tool_timestamp, x_tool_nonce, x_tool_token)
    return await _handle("browser_navigate", env)


@app.post("/v1/state")
async def state(env: Envelope, request: Request, x_tool_signature: str | None = Header(default=None), x_tool_timestamp: str | None = Header(default=None), x_tool_nonce: str | None = Header(default=None), x_tool_token: str | None = Header(default=None)):
    _verify_signature(await request.body(), x_tool_signature, x_tool_timestamp, x_tool_nonce, x_tool_token)
    return await _handle("browser_get_state", env)


@app.post("/v1/click")
async def click(env: Envelope, request: Request, x_tool_signature: str | None = Header(default=None), x_tool_timestamp: str | None = Header(default=None), x_tool_nonce: str | None = Header(default=None), x_tool_token: str | None = Header(default=None)):
    _verify_signature(await request.body(), x_tool_signature, x_tool_timestamp, x_tool_nonce, x_tool_token)
    return await _handle("browser_click", env)


@app.post("/v1/type")
async def type_text(env: Envelope, request: Request, x_tool_signature: str | None = Header(default=None), x_tool_timestamp: str | None = Header(default=None), x_tool_nonce: str | None = Header(default=None), x_tool_token: str | None = Header(default=None)):
    _verify_signature(await request.body(), x_tool_signature, x_tool_timestamp, x_tool_nonce, x_tool_token)
    return await _handle("browser_type", env)


@app.post("/v1/extract")
async def extract(env: Envelope, request: Request, x_tool_signature: str | None = Header(default=None), x_tool_timestamp: str | None = Header(default=None), x_tool_nonce: str | None = Header(default=None), x_tool_token: str | None = Header(default=None)):
    _verify_signature(await request.body(), x_tool_signature, x_tool_timestamp, x_tool_nonce, x_tool_token)
    return await _handle("browser_extract_content", env)


@app.post("/v1/screenshot")
async def screenshot(env: Envelope, request: Request, x_tool_signature: str | None = Header(default=None), x_tool_timestamp: str | None = Header(default=None), x_tool_nonce: str | None = Header(default=None), x_tool_token: str | None = Header(default=None)):
    _verify_signature(await request.body(), x_tool_signature, x_tool_timestamp, x_tool_nonce, x_tool_token)
    return await _handle("browser_screenshot", env)


@app.post("/v1/sessions/close")
async def sessions_close(env: Envelope, request: Request, x_tool_signature: str | None = Header(default=None), x_tool_timestamp: str | None = Header(default=None), x_tool_nonce: str | None = Header(default=None), x_tool_token: str | None = Header(default=None)):
    _verify_signature(await request.body(), x_tool_signature, x_tool_timestamp, x_tool_nonce, x_tool_token)
    return await _handle("browser_close_session", env)
