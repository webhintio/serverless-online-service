# This image needs to be run from the root folder instead of this path.
# docker packages/worker/Dockerfile . -t name:tag
FROM mcr.microsoft.com/azure-functions/node:2.0

#Update ubuntu
RUN apt-get update
RUN apt-get upgrade -y

# Install dependencies.
RUN apt-get install -y curl apt-transport-https gnupg

# Install chrome
# Webhint use puppeteer-core so we need to install a browser.
RUN curl -sL https://dl.google.com/linux/linux_signing_key.pub | apt-key add -
RUN echo "deb https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
RUN apt-get update
RUN apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst

# Install nodejs.
RUN curl -sL https://deb.nodesource.com/setup_10.x | bash -
RUN apt-get install -y nodejs build-essential

ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true

# This project is a monorepo, and because of that
# we need to do some preprocessing before build the project.
#
# First, we need to copy the tsconfig.json in the root
# of the project, so when we build the project, tsc can find
# the extended configuration.
#
# Second, we need to copy the utils packages keeping the
# "directory structure", that is why we copy it to /home/site/utils
#
# After these two steps, we are ready to build the worker.

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
COPY packages/worker /home/site/wwwroot

RUN npm run build
