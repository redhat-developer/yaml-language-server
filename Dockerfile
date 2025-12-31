FROM node:lts

WORKDIR /yaml-language-server

COPY . .

RUN npm install && \
    npm run build

ENTRYPOINT [ "node", "./out/server/src/server.js" ]
CMD [ "--stdio" ]
