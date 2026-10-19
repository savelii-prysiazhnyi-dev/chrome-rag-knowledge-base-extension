#!/usr/bin/env bash
set -euo pipefail

echo "========================================"
echo "🔍 Running QA Verification Suite"
echo "========================================"

has_script() {
  node -e "const pkg = require('./package.json'); process.exit(pkg.scripts && pkg.scripts['$1'] && !pkg.scripts['$1'].includes('no test specified') ? 0 : 1)"
}

echo ""
echo "👉 [1/5] Linting (pnpm run lint)..."
if has_script "lint"; then
  pnpm run lint
  echo "✅ Lint passed."
else
  echo "⏭️  No 'lint' script configured in package.json."
fi

echo ""
echo "👉 [2/5] Formatting check (pnpm run format:check)..."
if has_script "format:check"; then
  pnpm run format:check
  echo "✅ Format check passed."
else
  echo "⏭️  No 'format:check' script configured in package.json."
fi

echo ""
echo "👉 [3/5] Typechecking..."
if has_script "typecheck"; then
  pnpm run typecheck
  echo "✅ Typecheck passed."
elif [ -f "tsconfig.json" ]; then
  pnpm exec tsc --noEmit
  echo "✅ Typecheck (tsc --noEmit) passed."
else
  echo "⏭️  No 'typecheck' script or tsconfig.json found yet."
fi

echo ""
echo "👉 [4/5] Running tests..."
if has_script "test"; then
  pnpm run test
  echo "✅ Tests passed."
else
  echo "⏭️  No active 'test' script configured in package.json yet."
fi

echo ""
echo "👉 [5/5] Build verification..."
if has_script "build"; then
  pnpm run build
  echo "✅ Build passed."
else
  echo "⏭️  No 'build' script configured in package.json yet."
fi

echo ""
echo "========================================"
echo "🎉 All active QA checks passed with 0 errors!"
echo "========================================"
