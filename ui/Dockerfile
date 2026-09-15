# =============================================================================
# Dockerfile for animal-picture-ui
#
# Builds a small container image that serves the web page. It works in two
# "stages":
#   1. build:   install the tools and build the page into plain files,
#   2. runtime: copy only those files into an Nginx web server image.
# The final image contains no Node.js, no packages and no source code.
#
# Build it by hand with:   docker build -t animal-picture-ui ./ui
# Normally docker-compose.yml does this for you.
# =============================================================================

ARG NODE_IMAGE=node:24-alpine


# --- Stage 1: build the page --------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app

# Package lists first, so Docker can reuse the slow "npm ci" step when only
# the code has changed.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
RUN npm run build


# --- Stage 2: the image that actually runs -----------------------------------
# The "unprivileged" Nginx image runs as a normal user instead of root, like
# the API image does.
FROM nginxinc/nginx-unprivileged:1.30-alpine AS runtime

# Where to find the API. docker-compose.yml passes these in; the values here
# are the defaults. DNS_RESOLVER is Docker's built-in name server.
ENV API_HOST=animal-picture-api \
    API_PORT=3000 \
    DNS_RESOLVER=127.0.0.11

# Nginx turns this template into its real settings file when it starts.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

# The built page.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

# Every 30 seconds, check that Nginx answers. "wget" is part of Alpine Linux.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1:8080/ || exit 1
