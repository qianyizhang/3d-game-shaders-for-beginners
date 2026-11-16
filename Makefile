PYTHON ?= python3.12
RUFF ?= ruff

.PHONY: ci-check setup-check setup-browser lint test build-lab check-docs \
	check-browser check-native check-shaders check-full check-reviewed

ci-check: lint check-docs test build-lab

setup-browser:
	npm ci
	npm ci --prefix mill-shader-lab

setup-check: setup-browser
	npm ci --prefix dcc

lint:
	npm run lint
	$(RUFF) check
	git ls-files -z -- '*.sh' | xargs -0 shellcheck
	actionlint

test:
	npm test --prefix dcc
	$(PYTHON) -m unittest discover -s dcc
	$(PYTHON) mill-shader-lab/test/dcc_adapter.py
	npm run test:inspection --prefix mill-shader-lab
	npm run test:state --prefix mill-shader-lab

build-lab:
	npm run build --prefix mill-shader-lab

check-docs:
	$(PYTHON) shader-field-guide/build_demo.py --check
	@set -eu; output=$$(mktemp -d); trap 'rm -rf -- "$$output"' EXIT; \
		./docs/_build-docs.sh "$$output"

check-browser: build-lab
	npm run test:browser
	npm run test:smoke --prefix mill-shader-lab

check-native:
ifeq ($(shell uname -s),Darwin)
	./demonstration/macos.sh build
else
	./demonstration/build-for-linux.sh
endif

check-shaders:
	@set -eu; for shader in demonstration/shaders/vertex/*.vert demonstration/shaders/fragment/*.frag; do \
		glslangValidator "$$shader"; \
	done

check-full: ci-check check-browser check-native check-shaders

check-reviewed:
	DCC_VERIFY_SELECTED=1 PYTHONPATH=dcc $(PYTHON) -m unittest test_delivery.DeliveryTest.test_selected_deliveries_match_catalog
	@set -eu; output=$$(mktemp -d); trap 'rm -rf -- "$$output"' EXIT; \
		$(PYTHON) mill-shader-lab/tools/build_scene_gallery.py --output "$$output"
