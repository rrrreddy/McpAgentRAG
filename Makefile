.PHONY: help up down build logs migrate seed index-docs parse-lineage evaluate test lint fmt clean

help:
	@echo "Enterprise RAG + MCP Agents — common commands"
	@echo "  make up             Start the full stack (postgres, redis, 4 MCP servers, backend, frontend)"
	@echo "  make down           Stop the stack"
	@echo "  make build          Rebuild all images"
	@echo "  make logs           Tail logs for all services"
	@echo "  make migrate        Run Alembic migrations (also runs automatically on 'make up')"
	@echo "  make seed           Seed demo users + index sample SharePoint docs + parse sample Informatica XML"
	@echo "  make evaluate       Run the golden-dataset evaluation gate (D9) against the running stack"
	@echo "  make test           Run the backend pytest suite"
	@echo "  make clean          Stop the stack and remove volumes (DESTROYS local data)"

up:
	docker compose up -d --build
	@echo "Backend:  http://localhost:8000/docs"
	@echo "Frontend: http://localhost:5173"

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f

migrate:
	docker compose run --rm migrate

seed:
	docker compose run --rm backend python -m scripts.seed_users
	docker compose run --rm backend python -m scripts.index_documents
	docker compose run --rm backend python -m scripts.parse_informatica_samples

evaluate:
	docker compose run --rm backend python -m app.evaluation.evaluator

test:
	docker compose run --rm backend pytest -q

lint:
	docker compose run --rm backend python -m py_compile $$(find app scripts tests -name '*.py')

clean:
	docker compose down -v
