# Use a modern, secure, Debian-based Node.js image
FROM node:26-bookworm-slim

# Install dependencies for electron-builder, including CA certificates
RUN apt-get update && apt-get install -y p7zip-full ca-certificates --no-install-recommends

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or npm-shrinkwrap.json)
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy the rest of your app's source code
COPY . .

# Run the build command
CMD [ "npm", "run", "build:linux" ]
