# Runtime dependency check

14 October 2026: `npm audit --omit=dev` reports zero high/critical advisories and one moderate advisory in OpenZeppelin 5.2.0. The full install report also includes advisories in local test/development dependencies, including the EVM test toolchain; those are not evidence that the public demo ships those packages.

The OpenZeppelin advisory is GHSA-9rcw-c2f9-2j55: Bytes.lastIndexOf with a position argument can read out of bounds for empty buffers. The vault does not import or call Bytes; the recorded verification compiler input does not include Bytes.sol. Keep the deployed build's exact dependencies for reproducible verification. Review a patched dependency version before a new deployment; do not silently change the sources represented by existing bytecode.

This targeted dependency check is not a comprehensive production security audit. The current live integration is testnet-only.
