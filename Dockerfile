# Gunakan Node.js LTS Slim biar enteng
FROM node:20-slim

# Install dependencies yang dibutuhin buat Node (tanpa Chrome)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (Baileys gak butuh Chrome)
RUN npm install

# Copy source code (Exclude by .dockerignore)
COPY . .

# Expose port buat health check Koyeb
EXPOSE 8000

# Jalankan bot
CMD ["npm", "start"]
