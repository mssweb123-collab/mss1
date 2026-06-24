#!/bin/bash

# Load local .env file if it exists, ignoring comments and blank lines
if [ -f .env ]; then
  # Load env variables safely
  export $(grep -v '^#' .env | grep -v '^$' | xargs -d '\n')
fi

# Generate js/config.js dynamically using the loaded variables
echo "window.MSS_CONFIG = {
  SUPABASE_URL: \"$SUPABASE_URL\",
  SUPABASE_ANON_KEY: \"$SUPABASE_ANON_KEY\",
  ADMIN_USERNAME: \"${ADMIN_USERNAME:-admin}\",
  ADMIN_PASSWORD: \"${ADMIN_PASSWORD:-}\",
  GEMINI_API_KEY: \"$GEMINI_API_KEY\"
};" > js/config.js

echo "✔ Generated js/config.js from local .env successfully."

# Start local server
echo "🚀 Starting local lightweight web server on http://localhost:8000 ..."
python3 -m http.server 8000
