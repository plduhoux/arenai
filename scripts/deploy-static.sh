#!/bin/bash
# ArenAI - Deploy static site via SFTP (OVH)
#
# Usage: ./scripts/deploy-static.sh
#
# Requires .env with FTP_HOST, FTP_USERNAME, FTP_PASSWORD, FTP_PATH

set -e

cd "$(dirname "$0")/.."
ROOT=$(pwd)

# Load .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

if [ -z "$FTP_USERNAME" ] || [ -z "$FTP_PASSWORD" ] || [ -z "$FTP_HOST" ]; then
  echo "Error: FTP_USERNAME, FTP_PASSWORD, FTP_HOST must be set in .env"
  exit 1
fi

FTP_PATH="${FTP_PATH:-.}"

echo "=== ArenAI Static Deploy ==="
echo ""

# 1. Generate static site
node scripts/generate-static.js

# 2. Deploy via SFTP
echo ""
echo "Deploying to $FTP_HOST..."
cd dist
lftp -c "
set ftp:ssl-allow yes
open -u $FTP_USERNAME,$FTP_PASSWORD ftp://$FTP_HOST
mirror -R --parallel=5 --no-perms . $FTP_PATH
bye
"

echo ""
echo "=== Deployed ==="
