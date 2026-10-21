"""Settings read once from the environment (and a local .env file)."""

import os
from dataclasses import dataclass
from datetime import timedelta, timezone

from dotenv import load_dotenv

load_dotenv()

# India has no daylight saving, so a fixed offset is exact and needs no tz database.
IST = timezone(timedelta(hours=5, minutes=30), "Asia/Kolkata")


@dataclass(frozen=True)
class Settings:
    rate_limit_per_minute: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "20"))
    max_body_bytes: int = 10_000


settings = Settings()
