FROM node:lts

WORKDIR /yaml-language-server

COPY . .

RUN npm install && \
    npm run build

USER node

ENTRYPOINT [ "node", "./out/server/src/server.js" ]
CMD [ "--stdio" ]
