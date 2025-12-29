FROM node:20-slim

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3682

# Using npm run dev for testing as requested to "dockerise together"
# In a production setup, we would build and serve with nginx, 
# but for a dev/dockerise request, a dev server is often preferred for rapid iteration.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
