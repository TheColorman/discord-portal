FROM arm64v8/node:19-alpine

RUN apk add --update --no-cache make

RUN apk add build-base

RUN apk add --update --no-cache python3 && ln -sf python3 /usr/bin/python
RUN python3 -m ensurepip
RUN pip3 install --no-cache --upgrade pip setuptools

WORKDIR /home/node/app/

RUN npm install -g node-gyp

RUN npm install
RUN npm run build