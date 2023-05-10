FROM arm64v8/node:19-buster-slim

COPY ./ /home/node/app/
WORKDIR /home/node/app/

RUN apt update
RUN apt install python3 make gcc build-essential -y

# && ln -sf python3 /usr/bin/python
# RUN apt install python3-pip -y && ln -sf pip3 /usr/bin/pip
# RUN pip3 install --no-cache --upgrade pip setuptools

# RUN apt install musl-dev:arm64 -y --no-install-recommends && ln -sf /usr/lib/aarch64-linux-musl/libc.so /lib/libc.musl-aarch64.so.1

RUN npm install -g node-gyp
RUN npm install

# Build apng2gif
RUN apt install libpng-dev -y
RUN cd /home/node/app/bin/apng2gif-src && make
RUN cp /home/node/app/bin/apng2gif-src/apng2gif /home/node/app/bin/apng2gif

# Set permissions
# RUN chown -R 1001:1001 /home/node/app/
# RUN chmod -R 701 /home/node/app/