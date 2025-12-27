# Use Node.js 22 as the base image
FROM node:22

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
# We use --include=dev because nodemon might be devDependency but often used in docker dev
# Also adding platform specific install for sharp within the linux container env
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the API port
EXPOSE 5001

# Command to run the application
# We'll default to npm run dev for development usage as it uses nodemon
CMD ["npm", "run", "dev"]
