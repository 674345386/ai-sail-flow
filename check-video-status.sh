#!/bin/bash
# Load environment variables from .env
source /Users/cppeng/sop/.env

# Query video status
curl -X GET "https://gaorui.cc/v1/videos/vid_5b307a1db03f4f448d706d5544c407ff" \
  -H "Authorization: Bearer ${SOP_VEO_API_KEY}" \
  -H "User-Agent: Mozilla/5.0" \
  --connect-timeout 30 \
  --max-time 60 \
  -s | jq '.'
