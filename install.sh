#!/bin/bash

# API Frenzy CLI Installation Script
# Usage: curl -sSL https://raw.githubusercontent.com/neverwannafly/api-frenzy/main/cli/install.sh | bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BINARY_NAME="af-cli"
INSTALL_DIR="/usr/local/bin"
VERSION="latest"
REPO="api-frenzy/af-cli"

# Print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect OS and architecture
detect_platform() {
    local os=$(uname -s | tr '[:upper:]' '[:lower:]')
    local arch=$(uname -m)

    case "$os" in
        linux*)
            OS="linux"
            ;;
        darwin*)
            OS="darwin"
            ;;
        *)
            print_error "Unsupported operating system: $os"
            exit 1
            ;;
    esac

    case "$arch" in
        x86_64|amd64)
            ARCH="amd64"
            ;;
        arm64|aarch64)
            ARCH="arm64"
            ;;
        *)
            print_error "Unsupported architecture: $arch"
            exit 1
            ;;
    esac

    print_info "Detected platform: ${OS}-${ARCH}"
}

# Check if wstunnel is installed
check_wstunnel() {
    if command -v wstunnel &> /dev/null; then
        print_success "wstunnel is already installed"
        return 0
    else
        print_warning "wstunnel is not installed"
        print_info "You need wstunnel for af-cli to work properly"
        echo ""
        echo "Install wstunnel:"
        if [ "$OS" = "darwin" ]; then
            echo "  brew install wstunnel"
        else
            echo "  wget https://github.com/erebe/wstunnel/releases/latest/download/wstunnel-${OS}-${ARCH}"
            echo "  chmod +x wstunnel-${OS}-${ARCH}"
            echo "  sudo mv wstunnel-${OS}-${ARCH} /usr/local/bin/wstunnel"
        fi
        echo ""
        read -p "Continue with af-cli installation anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Download and install
install_cli() {
    local tmp_dir=$(mktemp -d)
    local download_url="https://github.com/${REPO}/releases/${VERSION}/download/${BINARY_NAME}-${OS}-${ARCH}.tar.gz"
    
    print_info "Downloading af-cli..."
    
    if command -v curl &> /dev/null; then
        curl -L "$download_url" -o "${tmp_dir}/${BINARY_NAME}.tar.gz"
    elif command -v wget &> /dev/null; then
        wget "$download_url" -O "${tmp_dir}/${BINARY_NAME}.tar.gz"
    else
        print_error "Neither curl nor wget found. Please install one of them."
        exit 1
    fi

    print_info "Extracting..."
    tar -xzf "${tmp_dir}/${BINARY_NAME}.tar.gz" -C "$tmp_dir"

    print_info "Installing to ${INSTALL_DIR}..."
    
    # Check if we need sudo
    if [ -w "$INSTALL_DIR" ]; then
        mv "${tmp_dir}/${BINARY_NAME}-${OS}-${ARCH}" "${INSTALL_DIR}/${BINARY_NAME}"
        chmod +x "${INSTALL_DIR}/${BINARY_NAME}"
    else
        sudo mv "${tmp_dir}/${BINARY_NAME}-${OS}-${ARCH}" "${INSTALL_DIR}/${BINARY_NAME}"
        sudo chmod +x "${INSTALL_DIR}/${BINARY_NAME}"
    fi

    # Cleanup
    rm -rf "$tmp_dir"

    print_success "af-cli installed successfully!"
}

# Verify installation
verify_installation() {
    if command -v af-cli &> /dev/null; then
        print_success "Installation verified"
        echo ""
        print_info "Run 'af-cli --help' to get started"
    else
        print_error "Installation verification failed"
        print_info "You may need to add ${INSTALL_DIR} to your PATH"
        exit 1
    fi
}

# Main installation flow
main() {
    echo ""
    echo "========================================"
    echo "  API Frenzy CLI Installation Script"
    echo "========================================"
    echo ""

    detect_platform
    check_wstunnel
    install_cli
    verify_installation

    echo ""
    print_success "Installation complete!"
    echo ""
}

# Run main function
main

