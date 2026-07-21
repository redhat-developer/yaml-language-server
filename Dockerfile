FROM node:lts

COPY . /yaml-language-server

RUN cd /yaml-language-server && \
    npm install && \
    npm run build

ENTRYPOINT [ "node", "/yaml-language-server/out/server/src/server.js" ]
CMD [ "--stdio" ]
