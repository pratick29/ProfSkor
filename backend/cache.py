import functools
import threading
import time
from typing import Any, Callable, Dict, Tuple

from config import CACHE_TTL_SECONDS

_MAX_ENTRIES = 2048


def ttl_cache(seconds: int = CACHE_TTL_SECONDS) -> Callable:
    """
    Cache (data, error) tuples from fetchers. Only successful results are cached,
    so transient errors (rate limits, timeouts) are retried on the next call.
    """

    def decorator(fn: Callable) -> Callable:
        store: Dict[Tuple, Tuple[float, Any]] = {}
        lock = threading.Lock()

        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            key = (args, tuple(sorted(kwargs.items())))
            now = time.monotonic()
            with lock:
                hit = store.get(key)
                if hit and now - hit[0] < seconds:
                    return hit[1]
            result = fn(*args, **kwargs)
            if isinstance(result, tuple) and len(result) == 2 and result[1] is None:
                with lock:
                    if len(store) >= _MAX_ENTRIES:
                        store.pop(next(iter(store)))
                    store[key] = (now, result)
            return result

        wrapper.cache_clear = store.clear  # type: ignore[attr-defined]
        return wrapper

    return decorator
