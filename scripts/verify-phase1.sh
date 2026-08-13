#!/bin/bash
set -e
echo "=== Phase 1 Acceptance ==="
echo "1. Typecheck..."
cd kmipn-26-deno && pnpm run typecheck
echo "2. Migrations status..."
cd kmipn-26-deno && pnpm run migrations:status
echo "3. Audit chain test..."
cd kmipn-26-deno && pnpm exec tsx scripts/test_audit_chain.ts
echo "=== Phase 1 PASSED ==="
