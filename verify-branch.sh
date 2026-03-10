#!/usr/bin/env bash
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <branch-name>"
  exit 1
fi

BRANCH="$1"

echo "Fetching origin..."
git fetch origin

echo "Checking out $BRANCH..."
git checkout "$BRANCH"

echo "Pulling latest..."
git pull origin

echo "Installing dependencies..."
npm ci

echo "Building..."
npm run build

echo "Running tests..."
npm run test

echo "Creating trigger commit..."
git commit --allow-empty -m "trigger build"

echo "Ready to push."
