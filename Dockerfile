FROM node:20-alpine AS builder

WORKDIR /app

RUN npm install -g @nestjs/cli

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate
RUN nest build

FROM node:20-alpine AS production

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

RUN npx prisma generate

EXPOSE 8080

CMD ["sh", "-c", "npx prisma db push && node dist/src/main.js"]    