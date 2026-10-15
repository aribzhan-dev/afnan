FROM node:22-alpine AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM python:3.13-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DATABASE_PATH=/app/data/store.db
COPY backend/requirements.lock ./requirements.lock
RUN pip install --no-cache-dir -r requirements.lock && useradd --create-home --uid 10001 store
COPY --chown=store:store backend/app ./backend/app
COPY --from=frontend --chown=store:store /build/dist ./dist
RUN mkdir -p /app/data && chown store:store /app/data
USER store
VOLUME ["/app/data"]
EXPOSE 8000
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=127.0.0.1"]
