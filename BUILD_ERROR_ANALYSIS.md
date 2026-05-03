# iOS Build Error Analysis

## Error: `type 'FileSystemUtilities' has no member 'isReadableFile'`

This is a **native Swift compilation error** from the `expo-image-manipulator` package (or similar expo package that uses `FileSystemUtilities` internally). It is NOT from our TypeScript code.

The fix from GitHub issue #27556 is to ensure all expo packages are compatible versions. The error happens when there's a version mismatch between expo-file-system native module and packages that depend on it.

## Resolution
- Check if expo-image-manipulator is installed and at compatible version
- Run `npx expo install --fix` to align all package versions
- The error is in native Swift code, not in our download-pdf.ts
