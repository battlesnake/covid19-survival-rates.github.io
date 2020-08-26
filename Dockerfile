from node:13-slim as builder
run mkdir -p /src
workdir /src
copy package.json ./
copy yarn.lock ./
run yarn install
copy . ./
run yarn build

from node:13-slim
run npm i -g http-server
run mkdir -p /srv
copy --from=builder /src/bin/ /srv/
workdir /srv/
run brotli -cd < out.json.brotli > out.json
entrypoint ["http-server", "/srv/", "-p", "80"]
