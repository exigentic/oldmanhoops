#!/usr/bin/env bash
# Push magic-link + invite email templates and the auth redirect allowlist to
# the hosted Supabase project via the Management API. Scope is intentionally
# narrow — unlike `supabase config push`, this does NOT touch SMTP, rate
# limits, or other [auth] settings.
#
# Requires:
#   - jq
#   - SUPABASE_ACCESS_TOKEN in env (see supabase/.env.secrets)
#   - SUPABASE_PROJECT_REF in env (defaults to the prod ref below)
#
# Usage:
#   set -a; . supabase/.env.secrets; set +a
#   ./scripts/push-supabase-auth.sh            # PATCH the remote project
#   ./scripts/push-supabase-auth.sh --dry-run  # Print the request body only

set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-seauwwxmsrlxkzjdlebb}"
SITE_URL="${SUPABASE_AUTH_SITE_URL:-https://www.oldmanhoops.net}"
ALLOW_LIST="${SUPABASE_AUTH_URI_ALLOW_LIST:-https://www.oldmanhoops.net/**,https://oldmanhoops.net/**}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
magic_link_html="$repo_root/supabase/templates/magic_link.html"
invite_html="$repo_root/supabase/templates/invite.html"

for f in "$magic_link_html" "$invite_html"; do
  [[ -f "$f" ]] || { echo "Missing template: $f" >&2; exit 1; }
done

body="$(jq -n \
  --arg site_url "$SITE_URL" \
  --arg allow_list "$ALLOW_LIST" \
  --rawfile ml "$magic_link_html" \
  --rawfile iv "$invite_html" \
  '{
    site_url: $site_url,
    uri_allow_list: $allow_list,
    mailer_subjects_magic_link: "Sign in to Old Man Hoops",
    mailer_templates_magic_link_content: $ml,
    mailer_subjects_invite: "You'"'"'re invited to Old Man Hoops",
    mailer_templates_invite_content: $iv
  }')"

if [[ "${1:-}" == "--dry-run" ]]; then
  echo "$body"
  exit 0
fi

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN must be set (see supabase/.env.secrets)}"

curl -sS -X PATCH "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --fail-with-body \
  -d "$body" \
  | jq '{site_url, uri_allow_list, mailer_subjects_magic_link, mailer_subjects_invite}'
