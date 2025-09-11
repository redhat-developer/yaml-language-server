FROM node:lts

WORKDIR /yaml-language-server

COPY . .

RUN npm install && \
    npm run build

ENTRYPOINT [ "node", "./lib/cjs/server.js" ]
CMD [ "--stdio" ]
