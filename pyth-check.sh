#!/usr/bin/env bash
# Diagnose Pyth Hermes for SOL and SKR with the key from .env. Prints status + body head; never prints the key.
cd "$(dirname "$0")"; set -a; source .env; set +a
SOL=ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d
SKR=38846ec4d0dbe808091817f5c0d6ab8058e25422348ddf97db52b6c378a93bf9
H="Authorization: Bearer $EXPO_PUBLIC_PYTH_API_KEY"
for name in SOL SKR; do id=${!name}
  for path in latest "$(( $(date +%s) - 3600 ))"; do
    echo "== $name /v2/updates/price/$path"
    curl -s -m 20 -w '\n[HTTP %{http_code}]\n' -H "$H" "https://hermes.pyth.network/v2/updates/price/$path?ids[]=$id&parsed=true" \
      | python3 -c "import sys,json,re
t=sys.stdin.read(); body,code=t.rsplit('\n[HTTP',1); print('HTTP',code.strip(' ]\n'))
try:
  d=json.loads(body); [print('  price',p['price']) for p in d.get('parsed',[])] or print('  ',body[:300])
except Exception: print('  ',body[:300])"
  done
done
echo "== SKR metadata"; curl -s -m 20 -H "$H" "https://hermes.pyth.network/v2/price_feeds?query=SKR&asset_type=crypto" | head -c 400; echo
