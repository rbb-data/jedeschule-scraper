# IMPORTANT: ALL APP CODE SHOULD BE PROVIDED VIA -v $FOLDER:/usr/src/app
# IMPORTANTER: ^ THIS IS CURRENTLY BROKEN UNDER WINDOWS (Firewall rules)

# Latest LTS node image
FROM node:boron

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json /usr/src/app

# Install app dependencies
RUN npm install

# Bundle app source
COPY . /usr/src/app

CMD [ "node", "bin/index.js" ]
