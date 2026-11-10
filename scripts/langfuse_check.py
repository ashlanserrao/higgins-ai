"""Send one made-up trace to Langfuse to check the keys, address and format: python scripts/langfuse_check.py

No AI provider is called. The trace is named "langfuse-check" and holds invented numbers: one
model call and one tool run, like a tiny agent request. Then look in Langfuse under Tracing.
"""

import asyncio
import logging
import sys

from higgins.core import telemetry
from higgins.core.config import Settings
from higgins.core.langfuse import LangfuseExporter
from higgins.core.telemetry import CallRecord, Usage


async def main() -> None:
    logging.basicConfig(level=logging.WARNING, format="%(message)s")
    settings = Settings()
    if not (settings.langfuse_public_key and settings.langfuse_secret_key):
        sys.exit("Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY in .env first.")
    exporter = LangfuseExporter(settings.langfuse_base_url, settings.langfuse_public_key, settings.langfuse_secret_key)
    stop = telemetry.subscribe(exporter)
    with telemetry.trace("langfuse-check") as facts:
        telemetry.record(CallRecord("check", "groq", "openai/gpt-oss-20b", 800, "ok", Usage(1900, 150, 6000, 999)))
        telemetry.record_tool("get_plan", "ok", 2)
        facts |= {"stopped": "done", "turns": 1, "note": "made-up numbers, no AI call"}
    stop()
    if await exporter.close():
        print(f"Sent to {settings.langfuse_base_url}. Open Langfuse > Tracing and look for 'langfuse-check'.")
    else:
        sys.exit("Langfuse didn't accept it: see the warning above.")


if __name__ == "__main__":
    asyncio.run(main())
