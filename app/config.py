"""Settings read once from the environment (and a local .env file)."""

import os
from dataclasses import dataclass, field
from datetime import timedelta, timezone

from dotenv import load_dotenv

load_dotenv()

# India has no daylight saving, so a fixed offset is exact and needs no tz database.
IST = timezone(timedelta(hours=5, minutes=30), "Asia/Kolkata")

# The AI features, as named in logs and in the per-task model settings.
AI_TASKS = ("ideas", "quotes", "understand")


@dataclass(frozen=True)
class Settings:
    openai_api_key: str = field(default=os.getenv("OPENAI_API_KEY", ""), repr=False)
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-5-nano")
    # Only sent for reasoning models; leave empty for models like gpt-4o-mini.
    openai_reasoning_effort: str = os.getenv("OPENAI_REASONING_EFFORT", "minimal")
    # Groq is tried first when its key is set; OpenAI is then the backup.
    groq_api_key: str = field(default=os.getenv("GROQ_API_KEY", ""), repr=False)
    groq_model: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
    groq_reasoning_effort: str = os.getenv("GROQ_REASONING_EFFORT", "low")
    # Groq's share of the time budget: short, so a slow reply leaves the backup time to answer.
    groq_timeout_seconds: float = float(os.getenv("GROQ_TIMEOUT_SECONDS", "5"))
    # Optional model per task, e.g. GROQ_MODEL_IDEAS=openai/gpt-oss-120b if the evals call for it.
    groq_task_models: dict[str, str] = field(default_factory=lambda: {
        task: model for task in AI_TASKS if (model := os.getenv(f"GROQ_MODEL_{task.upper()}"))
    })
    # The whole time one AI call may take, backup included.
    ai_timeout_seconds: float = float(os.getenv("AI_TIMEOUT_SECONDS", "15"))
    # AI idea requests per IP per minute.
    rate_limit_per_minute: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "20"))
    # Rules-only plan requests (including "what if" slider updates) per IP per minute.
    plan_rate_limit_per_minute: int = int(os.getenv("PLAN_RATE_LIMIT_PER_MINUTE", "120"))
    # AI requests per hour from all visitors together: caps spend even across many IPs.
    ai_total_limit_per_hour: int = int(os.getenv("AI_TOTAL_LIMIT_PER_HOUR", "200"))
    # Plans carry the progress held in the browser: bookings and up to 20 quotes.
    max_body_bytes: int = 64_000


settings = Settings()
