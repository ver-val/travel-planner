# ---------- Development image ----------
FROM node:22-alpine

WORKDIR /app

# Встановлюємо залежності
COPY package*.json ./
RUN npm install

# Встановлюємо ts-node і nodemon глобально (щоб працював watch)
RUN npm install -g ts-node nodemon

# Копіюємо увесь код
COPY . .

# Виставляємо змінні середовища
ENV NODE_ENV=development
ENV PORT=3000

EXPOSE 3000

CMD ["npx", "nodemon", "--watch", "src", "--exec", "ts-node", "src/main.ts"]
