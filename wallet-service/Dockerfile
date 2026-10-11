FROM node:22-alpine
WORKDIR /app
COPY server.mjs .
COPY public ./public
USER node
EXPOSE 8787
CMD ["node", "server.mjs"]
