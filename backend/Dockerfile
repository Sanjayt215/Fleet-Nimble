# Use bookworm-slim for better compatibility with Prisma and native modules
FROM node:20-bookworm-slim

# Set working directory
WORKDIR /app

# Install OpenSSL and other system dependencies required for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install production dependencies and Prisma
COPY package*.json ./
RUN npm ci

# Generate Prisma client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy application source code
COPY src ./src/

# Remove development dependencies
RUN npm prune --omit=dev

# Expose port
EXPOSE 5000

# Health check (respects container PORT env)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "const p=process.env.PORT||5000; require('http').get('http://127.0.0.1:'+p+'/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start server
CMD ["node", "src/server.js"]
