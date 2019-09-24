FROM mcr.microsoft.com/azure-functions/node:2.0

#Update ubuntu and install dependencies
RUN apt-get update
RUN apt-get upgrade -y
RUN apt-get install -y curl apt-transport-https gnupg vim

# Install nodejs
RUN curl -sL https://deb.nodesource.com/setup_10.x | bash -
RUN apt-get install -y nodejs build-essential

# Install chrome
RUN curl -sL https://dl.google.com/linux/linux_signing_key.pub | apt-key add -
RUN echo "deb https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
RUN apt-get update
RUN apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst

ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true

WORKDIR /home/site/wwwroot

COPY package.json /home/site/wwwroot

RUN npm install

# Double check you have the binaries for the Azure Service Bus extension
# before create the image.
COPY . /home/site/wwwroot

RUN npm run build
