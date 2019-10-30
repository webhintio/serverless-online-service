#!/bin/bash

cd packages/utils
rm -rf node_modules/
npm install --only=prod

cd ../services
rm -rf node_modules/
npm install --only=prod
