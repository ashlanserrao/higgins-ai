"""Write the API's OpenAPI schema to frontend/openapi.json, for `npm run gen:types`.

The app serves no schema or docs (openapi_url=None); app.openapi() builds one anyway.
Run from the repo root: python scripts/export_openapi.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.main import app  # noqa: E402  (needs the repo root on the path)

OUTPUT = ROOT / "frontend" / "openapi.json"


def main() -> None:
    schema = json.dumps(app.openapi(), indent=2, ensure_ascii=False)
    OUTPUT.write_text(schema + "\n", encoding="utf-8", newline="\n")
    print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
