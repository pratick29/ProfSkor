import os
import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import HTTPException, Request


RATE_LIMIT = int(os.getenv("RATE_LIMIT", "60"))
WINDOW_SECONDS = 60
hits: Dict[str, Deque[float]] = defaultdict(deque)


def enforce_rate_limit(request: Request) -> None:
    key = request.client.host if request.client else "unknown"
    now = time.time()
    bucket = hits[key]
    while bucket and (now - bucket[0] > WINDOW_SECONDS):
        bucket.popleft()
    if len(bucket) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again in a minute.")
    bucket.append(now)
