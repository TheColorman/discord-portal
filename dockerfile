FROM arm64v8/node:19-buster-slim

COPY ./ /home/node/app/
WORKDIR /home/node/app/

RUN apt install --update --no-cache make

RUN apt install build-base

RUN apt install --update --no-cache python3 && ln -sf python3 /usr/bin/python
RUN python3 -m ensurepip
RUN pip3 install --no-cache --upgrade pip setuptools

RUN npm install -g node-gyp

RUN npm install
RUN npm run build