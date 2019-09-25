# This image needs to be run from the root folder instead of this path.
# docker packages/worker/Dockerfile . -t name:tag
FROM mcr.microsoft.com/azure-functions/node:2.0

#Update ubuntu
RUN apt-get update
RUN apt-get upgrade -y

# Install dependencies.
RUN apt-get install -y curl apt-transport-https gnupg vim wget ca-certificates \
    gconf-service libasound2 libatk1.0-0 libatk-bridge2.0-0 libc6 \
    libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 \
    libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 \
    libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 \
    libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 fonts-liberation \
    libappindicator1 libnss3 lsb-release xdg-utils

# Install nodejs.
RUN curl -sL https://deb.nodesource.com/setup_10.x | bash -
RUN apt-get install -y nodejs build-essential

ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true

# Copy the main tsconfig.json
COPY tsconfig.json /home

# Build utils
RUN mkdir -p /home/site/utils

COPY packages/utils/package.json /home/site/utils

WORKDIR /home/site/utils

RUN npm install --ignore-engines

COPY packages/utils /home/site/utils

RUN npm run build

# Build worker
WORKDIR /home/site/wwwroot

COPY packages/worker/package.json /home/site/wwwroot

RUN npm install --ignore-engines

# Double check you have the binaries for the Azure Service Bus extension
# before create the image.
COPY packages/worker/ /home/site/wwwroot

RUN npm run build