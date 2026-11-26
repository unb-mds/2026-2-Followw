FROM node:24-bookworm-slim AS web-build
COPY --from=oven/bun:1.4.4 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY apps/web apps/web
COPY packages/core packages/core
RUN bun install --frozen-lockfile
COPY packages/unb-browser/unb_browser/calendar/academic_calendar.json packages/unb-browser/unb_browser/calendar/
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST=https://us.i.posthog.com
ARG FOLLOWW_NITRO_PRESET=node-server
RUN NITRO_PRESET="$FOLLOWW_NITRO_PRESET" bun run build

FROM node:24-bookworm-slim AS web
WORKDIR /app
COPY --from=web-build /app/apps/web/.output/ ./
COPY deploy/oci/web-h2c.mjs ./
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
USER node
CMD ["node", "server/index.mjs"]

FROM python:3.14-slim-bookworm AS api
COPY --from=ghcr.io/astral-sh/uv:0.12.17 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_LINK_MODE=copy PATH="/app/.venv/bin:$PATH"
COPY pyproject.toml uv.lock ./
COPY apps/api apps/api
COPY packages/sigaa-client packages/sigaa-client
COPY packages/unb-browser packages/unb-browser
RUN uv sync --frozen --no-dev
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--forwarded-allow-ips", "*", "--no-access-log"]

FROM api AS api-coolify
RUN uv sync --frozen --no-dev --group oci
COPY deploy/oci/api_asgi.py ./
