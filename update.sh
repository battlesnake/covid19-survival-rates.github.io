#!/bin/bash

set -e

cd "$(dirname "$(realpath "$0")")"

env -C .. git pull

yarn etl

git commit -am 'data update' || true

git push

ssh deadpool '
	cd empire/covid19/site
	git pull
	cd ..
	docker-compose up --build -d
	'
