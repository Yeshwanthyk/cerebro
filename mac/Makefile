.PHONY: build build-dev clean run

# Build release app bundle
notarize:
	@./scripts/build.sh

# Build for development
build-dev:
	@./scripts/build-dev.sh

# Clean build artifacts
clean:
	rm -rf .build
	rm -rf release

# Run development build
run: build-dev
	./.build/debug/Cerebro

# Open release app
open: build
	open release/Cerebro.app

# Install to /Applications
install: notarize
	rm -rf /Applications/Cerebro.app
	cp -r release/Cerebro.app /Applications/
	@echo "Installed to /Applications/Cerebro.app"

build:
	@SKIP_NOTARIZE=1 ./scripts/build.sh
