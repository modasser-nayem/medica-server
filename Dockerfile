# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency configs
COPY package.json yarn.lock ./

# Install all dependencies (development + production)
RUN yarn install --frozen-lockfile

# Copy Prisma schema
COPY prisma ./prisma/

# Generate Prisma Client
RUN yarn prisma generate

# Copy the rest of the application source code
COPY . .

# Build the TypeScript project
RUN yarn build

# Prune devDependencies to keep only production dependencies
RUN yarn install --production --frozen-lockfile --ignore-scripts --prefer-offline

# Stage 2: Production run stage
FROM node:20-alpine AS runner

WORKDIR /app

# Set NODE_ENV to production
ENV NODE_ENV=production

# Copy package.json and yarn.lock
COPY package.json yarn.lock ./

# Copy production node_modules from builder (includes Prisma client)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

# Copy built application source
COPY --from=builder /app/dist ./dist

# Expose port (defaults to 5050 in .env.example)
EXPOSE 5050

# Run migrations and start the application
CMD ["sh", "-c", "yarn prisma migrate deploy && yarn start"]
