#!/bin/sh
cd "$(dirname "$0")"
[ -f .env ] || { cp .env.example .env; echo "Created backend/.env - add your Gemini key, then run again."; exit 1; }
node server.mjs
