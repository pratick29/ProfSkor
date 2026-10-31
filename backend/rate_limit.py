import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import HTTPException, Request

from config import RATE_LIMIT, TRUSTED_PROXY_HOPS

WINDOW_SECONDS = 60
hits: Dict[str, Deque[float]] = defaultdict(deque)
_lock = threading.Lock()
_last_sweep = 0.0


def client_key(request: Request) -> str:
    """
    Identify the client. Behind N trusted proxies, each proxy appends the address it saw to
    X-Forwarded-For, so the Nth entry from the right is the real client. Entries further left
    are client-supplied and can be spoofed, so they are ignored.
    """
    if TRUSTED_PROXY_HOPS > 0:
        forwarded = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
        if len(forwarded) >= TRUSTED_PROXY_HOPS:
            return forwarded[-TRUSTED_PROXY_HOPS]
    return request.client.host if request.client else "unknown"


def _sweep(now: float) -> None:
    global _last_sweep
    if now - _last_sweep < WINDOW_SECONDS:
        return
    _last_sweep = now
    for key in [k for k, b in hits.items() if not b or now - b[-1] > WINDOW_SECONDS]:
        del hits[key]


def enforce_rate_limit(request: Request) -> None:
    key = client_key(request)
    now = time.time()
    with _lock:
        _sweep(now)
        bucket = hits[key]
        while bucket and (now - bucket[0] > WINDOW_SECONDS):
            bucket.popleft()
        if len(bucket) >= RATE_LIMIT:
            raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again in a minute.")
        bucket.append(now)
