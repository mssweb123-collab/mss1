#!/usr/bin/env bash
# =============================================================
# MSS SCHOOL – Vercel Build Script
# Injects environment variables into js/config.js at build time.
# Set these in: Vercel Dashboard → Project → Settings → Env Vars
#   SUPABASE_URL
#   SUPABASE_ANON_KEY
#   ADMIN_USERNAME
#   ADMIN_PASSWORD
# =============================================================
set -e

echo "🔧 Building MSS School CRM..."

# Substitute env vars into config.js from template
sed \
  -e "s|__SUPABASE_URL__|${SUPABASE_URL}|g" \
  -e "s|__SUPABASE_ANON_KEY__|${SUPABASE_ANON_KEY}|g" \
  -e "s|__ADMIN_USERNAME__|${ADMIN_USERNAME:-admin}|g" \
  -e "s|__ADMIN_PASSWORD__|${ADMIN_PASSWORD:-mss@admin2024}|g" \
  js/config.template.js > js/config.js

echo "✅ Config generated from environment variables."
echo "🚀 Build complete – ready to deploy."
