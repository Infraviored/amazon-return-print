FROM node:22-alpine
# npm/npx/corepack are not needed at runtime (server.mjs only uses node: builtins)
# and ship vulnerable bundled packages; drop them and pick up Alpine fixes.
RUN apk upgrade --no-cache \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
COPY server.mjs .
COPY public ./public
USER node
EXPOSE 8787
CMD ["node", "server.mjs"]
