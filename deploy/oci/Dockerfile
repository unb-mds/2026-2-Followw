FROM node:24-bookworm-slim AS web-build
COPY --from=oven/bun:1.4.5 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
RUN bun install --frozen-lockfile
COPY apps/web apps/web
COPY packages/core packages/core
COPY packages/unb-browser/unb_browser/calendar/academic_calendar.json packages/unb-browser/unb_browser/calendar/
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST=https://us.i.posthog.com
RUN NITRO_PRESET=node-middleware bun run build

FROM node:24-bookworm-slim AS web
WORKDIR /app
COPY --from=web-build /app/apps/web/.output/ ./
COPY deploy/oci/web-h2c.mjs deploy/oci/cloudflare-cidrs.txt ./
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 FOLLOWW_CLOUDFLARE_CIDRS=/app/cloudflare-cidrs.txt
USER node
CMD ["node", "web-h2c.mjs"]

FROM python:3.14-slim-bookworm AS api
COPY --from=ghcr.io/astral-sh/uv:0.13.4 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_LINK_MODE=copy PATH="/app/.venv/bin:$PATH"
COPY pyproject.toml uv.lock ./
COPY apps/api/pyproject.toml apps/api/
COPY packages/sigaa-client/pyproject.toml packages/sigaa-client/
COPY packages/unb-browser/pyproject.toml packages/unb-browser/
RUN uv sync --frozen --no-dev --group oci --no-install-workspace
COPY apps/api apps/api
COPY packages/sigaa-client packages/sigaa-client
COPY packages/unb-browser packages/unb-browser
RUN uv sync --frozen --no-dev --group oci
COPY deploy/oci/api_asgi.py deploy/oci/cloudflare-cidrs.txt ./
CMD ["hypercorn", "--bind", "0.0.0.0:8000", "api_asgi:application"]
