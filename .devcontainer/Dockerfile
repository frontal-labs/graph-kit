FROM mcr.microsoft.com/devcontainers/typescript-node:20

ARG NODE_VERSION="20"

RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
    curl \
    git \
    build-essential \
    python3 \
    make \
    g++ \
    libc6-dev \
    libssl-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g corepack@latest pnpm@9

USER node

WORKDIR /workspaces/graph-kit

CMD ["sleep", "infinity"]
