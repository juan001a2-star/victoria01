# Banca Victoria — imagen para Render / Docker
FROM node:22-bookworm-slim

WORKDIR /app

# Dependencias del sistema (opcional, útil para builds nativos)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias
COPY package.json package-lock.json ./
RUN npm ci

# Código fuente
COPY . .

# Build frontend + bundle del backend
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# db:push + seed + servidor (el start del package.json)
CMD ["npm", "start"]
