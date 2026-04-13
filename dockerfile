FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install
RUN npm install @prisma/client@5 prisma@5
RUN npx prisma generate
COPY . .
RUN npm run build
EXPOSE 3003
CMD ["node", "dist/main.js"]