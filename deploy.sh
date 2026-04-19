#!/bin/zsh
set -e

# Bump patch version in package.json
current=$(node -p "require('./package.json').version")
IFS='.' read -r major minor patch <<< "$current"
patch=$((patch + 1))
new_version="$major.$minor.$patch"

sed -i '' "s/\"version\": \"$current\"/\"version\": \"$new_version\"/" package.json
echo "Version: $current -> $new_version"

# Package extension
npm run package

# Remove old vsix files except the new one
find . -maxdepth 1 -name "lite-zen-*.vsix" ! -name "lite-zen-$new_version.vsix" -delete

