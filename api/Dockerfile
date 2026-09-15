# =============================================================================
# Dockerfile for animal-picture-api
#
# Builds a small container image that runs the API. It works in three
# "stages". Each stage starts from a clean image and only the result of the
# last one is kept, so the final image contains the compiled code and the
# packages it needs at runtime, but no TypeScript compiler, no tests and no
# development tools.
#
# Build it by hand with:   docker build -t animal-picture-api ./api
# Normally docker-compose.yml does this for you.
# =============================================================================

# The Node.js version, kept in one place. "alpine" is a very small Linux.
ARG NODE_IMAGE=node:24-alpine


# --- Stage 1: install every package, including development tools ------------
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app

# Copy only the package lists first. Docker caches each step, so as long as
# these two files don't change, the slow "npm ci" step is skipped on rebuilds.
COPY package.json package-lock.json ./

# "npm ci" installs exactly the versions in package-lock.json.
RUN npm ci


# --- Stage 2: compile the TypeScript ----------------------------------------
FROM dependencies AS build
WORKDIR /app

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Throw away the development packages, keeping only what's needed to run.
RUN npm prune --omit=dev


# --- Stage 3: the image that actually runs -----------------------------------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

# Tells Node.js and the packages that this is not a development environment.
ENV NODE_ENV=production

# Take the compiled code and the runtime packages from the build stage.
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Run as the unprivileged "node" user that the image provides, not as root.
# If the app were ever compromised, the attacker would gain very little.
USER node

# The port the API listens on. This is documentation for people and tools;
# docker-compose.yml actually opens it.
EXPOSE 3000

# Every 30 seconds, ask the API if it's healthy. Docker shows the result in
# "docker ps", and Compose waits for "healthy" before starting the UI.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.API_PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]
