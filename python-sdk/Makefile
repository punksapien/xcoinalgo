.PHONY: help install install-dev test lint format type-check build clean publish publish-test docs

help:  ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install:  ## Install package in current environment
	pip install -e .

install-dev:  ## Install package with development dependencies
	pip install -e ".[dev]"

test:  ## Run tests
	pytest tests/ -v --cov=coindcx_sdk --cov-report=term-missing

test-fast:  ## Run tests without coverage
	pytest tests/ -v

lint:  ## Run linting
	flake8 coindcx_sdk examples
	black --check coindcx_sdk examples

format:  ## Format code
	black coindcx_sdk examples

type-check:  ## Run type checking
	mypy coindcx_sdk

build:  ## Build package
	python -m build

clean:  ## Clean build artifacts
	rm -rf build/
	rm -rf dist/
	rm -rf *.egg-info/
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete

publish-test:  ## Publish to Test PyPI
	python -m twine upload --repository testpypi dist/*

publish:  ## Publish to PyPI
	python -m twine upload dist/*

docs:  ## Generate documentation
	@echo "Documentation is in README.md and examples/"

check:  ## Run all checks (lint, type-check, test)
	$(MAKE) lint
	$(MAKE) type-check
	$(MAKE) test

# Development workflow
dev-setup:  ## Set up development environment
	pip install --upgrade pip setuptools wheel
	pip install build twine
	$(MAKE) install-dev

release-check:  ## Check if package is ready for release
	$(MAKE) clean
	$(MAKE) check
	$(MAKE) build
	python -m twine check dist/*
	@echo "✅ Package is ready for release!"

# Examples
run-example:  ## Run an example strategy (specify EXAMPLE=filename)
	@if [ -z "$(EXAMPLE)" ]; then \
		echo "Usage: make run-example EXAMPLE=simple_sma_strategy"; \
		echo "Available examples:"; \
		ls examples/*.py | xargs -n1 basename; \
	else \
		cd examples && python $(EXAMPLE).py; \
	fi

# Package information
info:  ## Show package information
	@echo "Package: coindcx-strategy-sdk"
	@echo "Version: $(shell python -c "import coindcx_sdk; print(coindcx_sdk.__version__)")"
	@echo "Location: $(shell python -c "import coindcx_sdk; print(coindcx_sdk.__file__)")"

# Install from various sources for testing
install-from-testpypi:  ## Install from Test PyPI
	pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ coindcx-strategy-sdk

install-from-pypi:  ## Install from PyPI
	pip install coindcx-strategy-sdk

install-from-git:  ## Install from GitHub
	pip install git+https://github.com/coindcx/coindcx-strategy-sdk.git