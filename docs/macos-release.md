# macOS distribution release

The “moved to Trash because it contains malware” dialog is a Gatekeeper trust failure. Do not ask users to bypass Gatekeeper, remove quarantine attributes, or weaken macOS security.

`npm run package` intentionally refuses to create a distributable macOS release unless all of the following hold:

1. `CSC_NAME` selects a **Developer ID Application** certificate (not an Apple Development certificate).
2. `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER` point to an App Store Connect API key authorized to notarize `org.openantigravity.client`.
3. Apple accepts the upload and `xcrun stapler staple` attaches the ticket to the `.app` before the DMG and ZIP are created.

Use secret storage in CI or a local keychain; never put these values in source control or chat. The API key file is read only during the release command and is not copied into the app.

```bash
export CSC_NAME='Developer ID Application: Your Organization (TEAMID)'
export APPLE_API_KEY="$HOME/secure/AuthKey_ABC123.p8"
export APPLE_API_KEY_ID='ABC123'
export APPLE_API_ISSUER='00000000-0000-0000-0000-000000000000'
npm run package
spctl --assess --type execute --verbose=4 'release/mac-arm64/Agy Local.app'
```

`AGY_ALLOW_UNNOTARIZED_BUILD=1` is a local-debug escape hatch for CI/platform tests only. Its artifacts are deliberately non-distributable and must not be uploaded or shared with end users.
