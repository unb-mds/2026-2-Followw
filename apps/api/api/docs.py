import json
import mimetypes
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, HTMLResponse

router = APIRouter()

# Diretório raiz de documentação do repositório
DOCS_DIR = Path(__file__).resolve().parents[3] / "docs"

PAGES = {
    "arquitetura": {
        "title": "Arquitetura",
        "file": "arquitetura.md",
        "path": "/arquitetura",
    },
    "requisitos": {
        "title": "Requisitos Ágeis",
        "file": "requisitos.md",
        "path": "/requisitos",
    },
    "seguranca": {"title": "Segurança", "file": "segurança.md", "path": "/seguranca"},
    "sprints": {"title": "Sprints", "file": "assets/sprints.md", "path": "/sprints"},
}


def _read_markdown(filename: str) -> str:
    path = DOCS_DIR / filename
    return path.read_text(encoding="utf-8") if path.exists() else ""


# Links da API; o build estático (`apps/docs`) usa caminhos relativos.
API_LINKS = {
    "tabs": {"api": "/docs", **{key: cfg["path"] for key, cfg in PAGES.items()}},
    "openapi": "/openapi.json",
    "assets": "/assets/",
}


def render_page(active_tab: str = "api", links: dict = API_LINKS) -> str:
    tabs = links["tabs"]
    docs_payload = {key: _read_markdown(cfg["file"]) for key, cfg in PAGES.items()}
    docs_json = json.dumps(docs_payload).replace("</script>", "<\\/script>")

    html = f"""<!doctype html>
<html lang="pt-BR">
  <head>
    <title>Followw UnB API — Documentação</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/svg+xml" href="https://scalar.com/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <style>
      :root {{
        --bg-main: #0f0f11;
        --border: #27272a;
        --text: #f4f4f5;
        --text-muted: #a1a1aa;
        --accent: #8b5cf6;
        --accent-hover: #a78bfa;
        --accent-bg: rgba(139, 92, 246, 0.15);
        --header-height: 52px;
      }}
      * {{ box-sizing: border-box; margin: 0; padding: 0; }}
      body {{
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background-color: var(--bg-main);
        color: var(--text);
        line-height: 1.6;
        overflow-x: hidden;
      }}
      .site-header {{
        position: sticky;
        top: 0;
        z-index: 1000;
        height: var(--header-height);
        background: rgba(18, 18, 22, 0.95);
        backdrop-filter: blur(12px);
        border-bottom: 1px solid var(--border);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 24px;
      }}
      .header-left {{ display: flex; align-items: center; }}
      .brand {{
        display: flex;
        align-items: center;
        gap: 8px;
        text-decoration: none;
        color: #fff;
        font-weight: 700;
        font-size: 15px;
        margin-right: 2rem !important;
        white-space: nowrap;
      }}
      .brand-badge {{
        font-size: 11px;
        padding: 2px 7px;
        border-radius: 999px;
        background: var(--accent-bg);
        color: var(--accent-hover);
        font-weight: 600;
        border: 1px solid rgba(139, 92, 246, 0.3);
      }}
      .nav-tabs {{
        display: flex;
        align-items: center;
        gap: 1.5rem !important;
        list-style: none;
      }}
      .nav-tab-item a {{
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 6px;
        color: var(--text-muted);
        font-size: 14px;
        font-weight: 500;
        text-decoration: none;
        transition: all 0.15s ease;
        border: 1px solid transparent;
      }}
      .nav-tab-item a:hover {{
        color: #fff;
        background: rgba(255, 255, 255, 0.05);
      }}
      .nav-tab-item a.active {{
        color: #fff;
        background: var(--accent-bg);
        border-color: rgba(139, 92, 246, 0.35);
        font-weight: 600;
      }}
      .header-right {{ display: flex; align-items: center; }}
      .github-link {{
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--text-muted);
        text-decoration: none;
        font-size: 13px;
        padding: 6px 12px;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.02);
      }}
      .github-link:hover {{
        color: #fff;
        border-color: rgba(255, 255, 255, 0.25);
      }}
      .viewport-container {{
        height: calc(100vh - var(--header-height));
        overflow: auto;
      }}
      #view-api {{ width: 100%; height: 100%; }}
      #view-markdown {{
        display: none;
        max-width: 980px;
        margin: 0 auto;
        padding: 48px 32px 96px;
      }}
      .markdown-body {{ font-size: 15px; line-height: 1.7; }}
      .markdown-body h1 {{ font-size: 32px; font-weight: 700; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid var(--border); color: #fff; }}
      .markdown-body h2 {{ font-size: 24px; font-weight: 600; margin-top: 36px; margin-bottom: 16px; color: #fff; }}
      .markdown-body h3 {{ font-size: 19px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #f4f4f5; }}
      .markdown-body h4 {{ font-size: 16px; font-weight: 600; margin-top: 20px; margin-bottom: 8px; color: #e4e4e7; }}
      .markdown-body p {{ margin-bottom: 16px; color: #d4d4d8; }}
      .markdown-body ul, .markdown-body ol {{ margin-bottom: 18px; padding-left: 28px; color: #d4d4d8; }}
      .markdown-body li {{ margin-bottom: 6px; }}
      .markdown-body hr {{ border: none; height: 1px; background: var(--border); margin: 32px 0; }}
      .markdown-body a {{ color: var(--accent-hover); text-decoration: none; }}
      .markdown-body a:hover {{ text-decoration: underline; }}
      .markdown-body table {{
        width: 100%;
        border-collapse: collapse;
        margin: 24px 0;
        font-size: 14px;
        background: #121215;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid var(--border);
      }}
      .markdown-body th {{ background: #1a1a1f; padding: 12px 16px; text-align: left; font-weight: 600; color: #fff; border-bottom: 1px solid var(--border); }}
      .markdown-body td {{ padding: 12px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #d4d4d8; }}
      .markdown-body tr:last-child td {{ border-bottom: none; }}
      .markdown-body pre {{
        background: #131316;
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 18px;
        overflow-x: auto;
        margin: 20px 0;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 13.5px;
      }}
      .markdown-body code {{
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 13px;
        background: rgba(255, 255, 255, 0.08);
        padding: 2px 6px;
        border-radius: 4px;
      }}
      .markdown-body pre code {{ background: transparent; padding: 0; }}
      .markdown-body img {{
        max-width: 100%;
        height: auto;
        display: block;
        margin: 24px auto;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: #18181b;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
      }}
    </style>
  </head>
  <body>
    <header class="site-header">
      <div class="header-left">
        <a href="{tabs["api"]}" class="brand" onclick="navigateTab(event, 'api')">
          <span>Followw UnB API</span>
          <span class="brand-badge">v0.1.0</span>
        </a>
        <nav>
          <ul class="nav-tabs" role="tablist">
            <li class="nav-tab-item">
              <a href="{tabs["api"]}" id="tab-btn-api" onclick="navigateTab(event, 'api')">
                <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M229.66,101.66l-75.32,75.31a8,8,0,0,1-11.31,0L112,146l-58.34,58.34a8,8,0,0,1-11.32-11.31L100.69,134.7,69.66,103.66a8,8,0,0,1,0-11.32l75.31-75.31a8,8,0,0,1,11.32,0l73.37,73.31A8,8,0,0,1,229.66,101.66Z" opacity="0.2"></path>
                  <path d="M235.31,96,160,20.69a16,16,0,0,0-22.62,0L96,62.06a16,16,0,0,0-4.69,11.31v.63L65,100.34,26.34,139a8,8,0,0,0,0,11.32l24,24a8,8,0,0,0,11.32,0L100.34,135l26.34,26.34a16,16,0,0,0,11.94,4.66h.63L181.94,142a16,16,0,0,0,11.31-4.69l42.06-42.06A16,16,0,0,0,235.31,96Z"></path>
                </svg>
                <span>API</span>
              </a>
            </li>
            <li class="nav-tab-item">
              <a href="{tabs["arquitetura"]}" id="tab-btn-arquitetura" onclick="navigateTab(event, 'arquitetura')">
                <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M240,208H224V96a16,16,0,0,0-16-16H144V40a16,16,0,0,0-16-16H40A16,16,0,0,0,24,40V208H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16ZM40,40h88V208H40ZM144,96h64V208H144Z"></path>
                </svg>
                <span>Arquitetura</span>
              </a>
            </li>
            <li class="nav-tab-item">
              <a href="{tabs["requisitos"]}" id="tab-btn-requisitos" onclick="navigateTab(event, 'requisitos')">
                <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M200,32H163.74a47.92,47.92,0,0,0-71.48,0H56A16,16,0,0,0,40,48V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V48A16,16,0,0,0,200,32Zm-72,0a32,32,0,0,1,32,32H96A32,32,0,0,1,128,32Zm72,184H56V48H82.75A47.93,47.93,0,0,0,80,64v8a8,8,0,0,0,8,8h80a8,8,0,0,0,8-8V64a47.93,47.93,0,0,0-2.75-16H200ZM160,112a8,8,0,0,1-8,8H104a8,8,0,0,1,0-16h48A8,8,0,0,1,160,112Zm0,32a8,8,0,0,1-8,8H104a8,8,0,0,1,0-16h48A8,8,0,0,1,160,144Zm0,32a8,8,0,0,1-8,8H104a8,8,0,0,1,0-16h48A8,8,0,0,1,160,176Z"></path>
                </svg>
                <span>Requisitos Ágeis</span>
              </a>
            </li>
            <li class="nav-tab-item">
              <a href="{tabs["seguranca"]}" id="tab-btn-seguranca" onclick="navigateTab(event, 'seguranca')">
                <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M208,40H48A16,16,0,0,0,32,56v58.78c0,89.61,75.82,119.34,91,124.39a15.53,15.53,0,0,0,10,0c15.2-5.05,91-34.78,91-124.39V56A16,16,0,0,0,208,40Zm-34.34,77.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,156.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z"></path>
                </svg>
                <span>Segurança</span>
              </a>
            </li>
            <li class="nav-tab-item">
              <a href="{tabs["sprints"]}" id="tab-btn-sprints" onclick="navigateTab(event, 'sprints')">
                <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM96,192H48V64H96Zm56,0H112V64h40Zm56,0H168V64h40Z"></path>
                </svg>
                <span>Sprints</span>
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div class="header-right">
        <a href="https://github.com/unb-mds/2026-2-Followw" target="_blank" rel="noopener noreferrer" class="github-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          <span>GitHub</span>
        </a>
      </div>
    </header>

    <main class="viewport-container" id="main-viewport">
      <section id="view-api">
        <script
          id="api-reference"
          data-url="{links["openapi"]}"
          data-configuration='{{"theme":"purple","layout":"modern","darkMode":true}}'
        ></script>
        <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
      </section>

      <article id="view-markdown" class="markdown-body">
        <div id="markdown-content"></div>
      </article>
    </main>

    <script id="docs-data" type="application/json">
      {docs_json}
    </script>

    <script>
      const docsData = JSON.parse(document.getElementById('docs-data').textContent);
      const tabPaths = {json.dumps(tabs)};
      const assetsUrl = {json.dumps(links["assets"])};

      function updateActiveTabState(tabId) {{
        document.querySelectorAll('.nav-tab-item a').forEach(el => el.classList.remove('active'));
        const btn = document.getElementById('tab-btn-' + tabId);
        if (btn) btn.classList.add('active');
      }}

      function showTab(tabId, pushHistory = false) {{
        const viewApi = document.getElementById('view-api');
        const viewMd = document.getElementById('view-markdown');
        const mdContainer = document.getElementById('markdown-content');
        const viewport = document.getElementById('main-viewport');

        updateActiveTabState(tabId);

        if (pushHistory && tabPaths[tabId]) {{
          window.history.pushState({{ tab: tabId }}, '', tabPaths[tabId]);
        }}

        if (tabId === 'api') {{
          viewApi.style.display = 'block';
          viewMd.style.display = 'none';
          document.title = 'Followw UnB API — Documentação';
        }} else {{
          viewApi.style.display = 'none';
          viewMd.style.display = 'block';

          let mdText = docsData[tabId] || '# Documento não encontrado';
          mdText = mdText.replace(/\\(assets\\//g, '(' + assetsUrl);
          mdText = mdText.replace(/src=["']assets\\//g, 'src="' + assetsUrl);

          if (window.marked) {{
            mdContainer.innerHTML = marked.parse(mdText);
          }} else {{
            mdContainer.innerText = mdText;
          }}

          viewport.scrollTop = 0;
          const titles = {{
            arquitetura: 'Arquitetura',
            requisitos: 'Requisitos Ágeis',
            seguranca: 'Segurança',
            sprints: 'Sprints'
          }};
          document.title = (titles[tabId] || 'Documentação') + ' — Followw UnB';
        }}
      }}

      function navigateTab(e, tabId) {{
        e.preventDefault();
        showTab(tabId, true);
      }}

      window.addEventListener('popstate', (e) => showTab(e.state?.tab || initialTab, false));

      const initialTab = "{active_tab}";
      document.addEventListener('DOMContentLoaded', () => {{
        showTab(initialTab, false);
      }});
    </script>
  </body>
</html>
"""
    return html


def build_static(out: Path) -> None:
    from api.main import app

    links = {
        "tabs": {"api": "./", **{key: f"{key}.html" for key in PAGES}},
        "openapi": "openapi.json",
        "assets": "assets/",
    }
    shutil.rmtree(out, ignore_errors=True)
    shutil.copytree(DOCS_DIR / "assets", out / "assets")
    (out / "openapi.json").write_text(json.dumps(app.openapi(), ensure_ascii=False))
    (out / "index.html").write_text(render_page("api", links))
    for key in PAGES:
        (out / f"{key}.html").write_text(render_page(key, links))
    # sem Jekyll, o GitHub Pages serve os arquivos como estão
    (out / ".nojekyll").touch()


def _render_shell(active_tab: str) -> HTMLResponse:
    return HTMLResponse(render_page(active_tab))


@router.get("/docs", include_in_schema=False)
async def docs_page() -> HTMLResponse:
    return _render_shell("api")


@router.get("/arquitetura", include_in_schema=False)
async def arquitetura_page() -> HTMLResponse:
    return _render_shell("arquitetura")


@router.get("/requisitos", include_in_schema=False)
async def requisitos_page() -> HTMLResponse:
    return _render_shell("requisitos")


@router.get("/seguranca", include_in_schema=False)
async def seguranca_page() -> HTMLResponse:
    return _render_shell("seguranca")


@router.get("/sprints", include_in_schema=False)
async def sprints_page() -> HTMLResponse:
    return _render_shell("sprints")


@router.get("/assets/{file_path:path}", include_in_schema=False)
@router.get("/docs/assets/{file_path:path}", include_in_schema=False)
async def serve_asset(file_path: str):
    file = DOCS_DIR / "assets" / file_path
    if not file.exists():
        raise HTTPException(status_code=404, detail="Asset not found")
    media_type, _ = mimetypes.guess_type(str(file))
    return FileResponse(file, media_type=media_type or "application/octet-stream")
