FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=9000
ENV REALTIME_PROXY_PATH=/realtime

EXPOSE 9000

CMD ["npm", "run", "start:cloud"]
