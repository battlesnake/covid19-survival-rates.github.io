#!/bin/bash

set -ex

cd "$(dirname "$(realpath "$0")")"

env -C .. git pull

test -n "${no_etl:-}" || yarn etl

git commit -am 'data update' || true

git push

ssh deadpool '
	cd empire/covid19/site
	git pull
	yarn extract
	cd ..
	docker-compose up --build -d
	'
