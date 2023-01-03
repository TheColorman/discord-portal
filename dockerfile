# Install python
FROM arm64v8/node:19-alpine
RUN apt-get update && apt-get install -y python3 python3-pip
RUN pip3 install --upgrade pip