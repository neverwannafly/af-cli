.PHONY: build build-all install clean test help deps

# Binary name
BINARY_NAME=af-cli

# Build directory
BUILD_DIR=bin

# Version info
VERSION?=0.1.0
GIT_COMMIT=$(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME=$(shell date -u '+%Y-%m-%d_%H:%M:%S')

# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GOCLEAN=$(GOCMD) clean
GOTEST=$(GOCMD) test
GOGET=$(GOCMD) get
GOMOD=$(GOCMD) mod

# Build flags
LDFLAGS=-ldflags "-X main.Version=$(VERSION) -X main.GitCommit=$(GIT_COMMIT) -X main.BuildTime=$(BUILD_TIME)"

help: ## Display this help screen
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

deps: ## Download dependencies
	$(GOMOD) download
	$(GOMOD) tidy

build: deps ## Build the binary for current platform
	@echo "Building $(BINARY_NAME) for current platform..."
	@mkdir -p $(BUILD_DIR)
	$(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) .
	@echo "Build complete: $(BUILD_DIR)/$(BINARY_NAME)"

build-linux: deps ## Build for Linux (amd64)
	@echo "Building $(BINARY_NAME) for Linux amd64..."
	@mkdir -p $(BUILD_DIR)
	GOOS=linux GOARCH=amd64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-linux-amd64 .
	@echo "Build complete: $(BUILD_DIR)/$(BINARY_NAME)-linux-amd64"

build-linux-arm64: deps ## Build for Linux (arm64)
	@echo "Building $(BINARY_NAME) for Linux arm64..."
	@mkdir -p $(BUILD_DIR)
	GOOS=linux GOARCH=arm64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-linux-arm64 .
	@echo "Build complete: $(BUILD_DIR)/$(BINARY_NAME)-linux-arm64"

build-mac: deps ## Build for macOS (amd64)
	@echo "Building $(BINARY_NAME) for macOS amd64..."
	@mkdir -p $(BUILD_DIR)
	GOOS=darwin GOARCH=amd64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-amd64 .
	@echo "Build complete: $(BUILD_DIR)/$(BINARY_NAME)-darwin-amd64"

build-mac-arm64: deps ## Build for macOS (arm64/M1)
	@echo "Building $(BINARY_NAME) for macOS arm64..."
	@mkdir -p $(BUILD_DIR)
	GOOS=darwin GOARCH=arm64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-arm64 .
	@echo "Build complete: $(BUILD_DIR)/$(BINARY_NAME)-darwin-arm64"

build-all: build-linux build-linux-arm64 build-mac build-mac-arm64 ## Build for all platforms
	@echo "All builds complete!"

install: build ## Install the binary to $GOPATH/bin
	@echo "Installing $(BINARY_NAME)..."
	@cp $(BUILD_DIR)/$(BINARY_NAME) $(GOPATH)/bin/$(BINARY_NAME)
	@echo "Installed to $(GOPATH)/bin/$(BINARY_NAME)"

clean: ## Remove build artifacts
	@echo "Cleaning..."
	@rm -rf $(BUILD_DIR)
	$(GOCLEAN)
	@echo "Clean complete!"

test: ## Run tests
	$(GOTEST) -v ./...

run: build ## Build and run the application
	./$(BUILD_DIR)/$(BINARY_NAME)

# Distribution targets
dist: build-all ## Create distribution packages
	@echo "Creating distribution packages..."
	@mkdir -p $(BUILD_DIR)/dist
	@cd $(BUILD_DIR) && tar -czf dist/$(BINARY_NAME)-$(VERSION)-linux-amd64.tar.gz $(BINARY_NAME)-linux-amd64
	@cd $(BUILD_DIR) && tar -czf dist/$(BINARY_NAME)-$(VERSION)-linux-arm64.tar.gz $(BINARY_NAME)-linux-arm64
	@cd $(BUILD_DIR) && tar -czf dist/$(BINARY_NAME)-$(VERSION)-darwin-amd64.tar.gz $(BINARY_NAME)-darwin-amd64
	@cd $(BUILD_DIR) && tar -czf dist/$(BINARY_NAME)-$(VERSION)-darwin-arm64.tar.gz $(BINARY_NAME)-darwin-arm64
	@echo "Distribution packages created in $(BUILD_DIR)/dist/"

