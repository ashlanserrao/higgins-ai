"""Settings read once from the environment (and a local .env file)."""

import os
from dataclasses import dataclass, field
from datetime import timedelta, timezone

from dotenv import load_dotenv

load_dotenv()

# India has no daylight saving, so a fixed offset is exact and needs no tz database.
IST = timezone(timedelta(hours=5, minutes=30), "Asia/Kolkata")


@dataclass(frozen=True)
class Settings:
    openai_api_key: str = field(default=os.getenv("OPENAI_API_KEY", ""), repr=False)
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-5-nano")
    # Only sent for reasoning models; leave empty for models like gpt-4o-mini.
    openai_reasoning_effort: str = os.getenv("OPENAI_REASONING_EFFORT", "minimal")
    ai_timeout_seconds: float = float(os.getenv("AI_TIMEOUT_SECONDS", "15"))
    rate_limit_per_minute: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "20"))
    max_body_bytes: int = 10_000


settings = Settings()
