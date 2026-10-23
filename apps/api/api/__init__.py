from pathlib import Path

import uvicorn


def main():
    root = Path(__file__).resolve().parents[3]
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=8000,
        root_path="/api",
        reload=True,
        reload_dirs=[
            root / "apps/api/api",
            root / "packages/sigaa-client/sigaa_client",
            root / "packages/unb-browser/unb_browser",
        ],
    )
