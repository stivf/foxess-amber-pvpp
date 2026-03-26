.PHONY: dev test build down logs

dev:
	docker compose up

test:
	docker compose run --rm test

build:
	docker compose -f docker-compose.prod.yml build

down:
	docker compose down

logs:
	docker compose logs -f
