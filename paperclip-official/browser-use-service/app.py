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
import redis.asyncio as redis


class Envelope(BaseModel):
    agentId: str = Field(min_length=1, max_length=128)
    runId: str = Field(min_length=1, max_length=128)
    taskKey: str | None = None
    toolInput: dict[str, Any]
    traceId: str | None = None


app = FastAPI(title="paperclip-browser-use-service")
server = BrowserUseServer(session_timeout_minutes=10)

_NONCE_TTL_MS = 6 * 60 * 1000
_redis_client: redis.Redis | None = None


def _resolve_nonce_redis_url() -> str | None:
    # Prefer a dedicated setting; fall back to the shared server redis URL.
    url = os.getenv("PAPERCLIP_BROWSER_USE_NONCE_REDIS_URL", "").strip()
    if url:
        return url
    url = os.getenv("PAPERCLIP_REDIS_URL", "").strip()
    return url or None


def _get_redis_client() -> redis.Redis | None:
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    url = _resolve_nonce_redis_url()
    if not url:
        raise HTTPException(status_code=500, detail="nonce redis url not configured")
    _redis_client = redis.from_url(url, decode_responses=True)
    return _redis_client


async def _check_and_store_nonce(nonce: str, now_ms: int) -> None:
    """防止 nonce 重放：強制使用 Redis（跨多實例一致）。"""
    _ = now_ms
    client = _get_redis_client()
    key = f"paperclip:browser-use:nonce:{nonce}"
    ok = await client.set(key, "1", nx=True, px=_NONCE_TTL_MS)
    if not ok:
        raise HTTPException(status_code=401, detail="nonce already used")


def _resolve_headless(tool_input: dict[str, Any]) -> bool:
    """與 Paperclip gateway 的 PAPERCLIP_BROWSER_USE_DEBUG 一致：debug 開啟時顯示瀏覽器（headless=False）。"""
    raw = tool_input.get("headless")
    if raw is not None:
        return bool(raw)
    debug = os.getenv("PAPERCLIP_BROWSER_USE_DEBUG", "").strip().lower() in ("1", "true", "yes")
    return not debug


async def _verify_signature(
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
    await _check_and_store_nonce(nonce, int(time.time() * 1000))


async def _handle(tool_name: str, env: Envelope) -> dict[str, Any]:
    trace_id = env.traceId or str(uuid.uuid4())
    try:
        result = await server._execute_tool(tool_name, env.toolInput)
        out: dict[str, Any] = {"ok": True, "data": result, "error": None, "traceId": trace_id}
        # browser_extract_content 會呼叫 LLM：附帶 usage 供控制平面計費
        if tool_name == "browser_extract_content":
            usage = getattr(server, "_last_llm_usage", None)
            if usage:
                out["llmUsage"] = usage
            model = getattr(server, "_last_llm_model", None)
            if model:
                out["llmModel"] = model
            prov = getattr(server, "_last_llm_provider", None)
            if prov:
                out["llmProvider"] = prov
        return out
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
    await _verify_signature(await request.body(), x_tool_signature, x_tool_timestamp, x_tool_nonce, x_tool_token)
    await server._init_browser_session(
        allowed_domains=env.toolInput.get("allowedDomains"),
        headless=_resolve_headless(env.toolInput),
    )
    return await _handle("browser_list_sessions", env)


@app.post("/v1/navigate")
async def navigate(env: Envelope, request: Request, x_tool_signature: str | None = Header(default=None), x_tool_timestamp: str | None = Header(default=None), x_tool_nonce: str | None = Header(default=None), x_tool_token: str | None = Header(default=None)):
    await _verify_signature(await request.body(), x_tool_signature, x_tool_timestamp, x_tool_nonce, x_tool_token)
    return await _handle("browser_navigate", env)


@app.post("/v1/state")
async def state(env: Envelope, request: Request, x_tool_signature: str | None = Header(default=None), x_tool_timestamp: str | None = Header(default=None), x_tool_nonce: str | None = Header(default=None), x_tool_token: str | None = Header(default=None)):
    await _verify_signature(await request.body(), x_tool_signature, x_tool_timestamp, x_tool_nonce, x_tool_token)
    return await _handle("browser_get_state", env)


@app.post("/v1/click")
async def click(env: Envelope, request: Request, x_tool_signature: str | None = Header(default=None), x_tool_timestamp: str | None = Header(default=None), x_tool_nonce: str | None = Header(default=None), x_tool_token: str | None = Header(default=None)):
    await _verify_signature(await request.body(), x_tool_signature, x_tool_timestamp, x_tool_nonce, x_tool_token)
    return await _handle("browser_click", env)


@app.post("/v1/type")
async def type_text(env: Envelope, request: Request, x_tool_signature: str | None = Header(default=None), x_tool_timestamp: str | None = Header(default=None), x_tool_nonce: str | None = Header(default=None), x_tool_token: str | None = Header(default=None)):
    await _verify_signature(await request.body(), x_tool_signature, x_tool_timestamp, x_tool_nonce, x_tool_token)
    return await _handle("browser_type", env)


@app.post("/v1/extract")
async def extract(env: Envelope, request: Request, x_tool_signature: str | None = Header(default=None), x_tool_timestamp: str | None = Header(default=None), x_tool_nonce: str | None = Header(default=None), x_tool_token: str | None = Header(default=None)):
    await _verify_signature(await request.body(), x_tool_signature, x_tool_timestamp, x_tool_nonce, x_tool_token)
    return await _handle("browser_extract_content", env)


@app.post("/v1/screenshot")
async def screenshot(env: Envelope, request: Request, x_tool_signature: str | None = Header(default=None), x_tool_timestamp: str | None = Header(default=None), x_tool_nonce: str | None = Header(default=None), x_tool_token: str | None = Header(default=None)):
    await _verify_signature(await request.body(), x_tool_signature, x_tool_timestamp, x_tool_nonce, x_tool_token)
    return await _handle("browser_screenshot", env)


@app.post("/v1/sessions/close")
async def sessions_close(env: Envelope, request: Request, x_tool_signature: str | None = Header(default=None), x_tool_timestamp: str | None = Header(default=None), x_tool_nonce: str | None = Header(default=None), x_tool_token: str | None = Header(default=None)):
    await _verify_signature(await request.body(), x_tool_signature, x_tool_timestamp, x_tool_nonce, x_tool_token)
    return await _handle("browser_close_session", env)
