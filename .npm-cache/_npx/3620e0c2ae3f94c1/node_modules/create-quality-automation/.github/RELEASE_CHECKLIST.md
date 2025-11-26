# Release Checklist 🚀

Use this checklist before any version bump or npm publication.

## 📋 Pre-Release Documentation Review

### Version Consistency

- [ ] `package.json` version matches intended release
- [ ] `CHANGELOG.md` has entry for current version
- [ ] No "Unreleased" items that should be in current version
- [ ] Roadmap section doesn't reference completed versions

### File Inventory Accuracy

- [ ] README "What Gets Added" matches `setup.js` file creation logic
- [ ] All template files in `/config` are documented
- [ ] TypeScript-specific files mentioned when applicable
- [ ] Python-specific files mentioned when applicable

### Feature Documentation Completeness

- [ ] All new features from this version documented in README
- [ ] Configuration examples provided for new features
- [ ] Usage instructions clear and complete
- [ ] Security features properly documented

### Security Audit Compliance

- [ ] `KEYFLASH_INSPIRED_SECURITY_AUDIT.md` findings remain resolved
- [ ] **CRITICAL**: Gitleaks checksums are real SHA256 values, not placeholders
- [ ] `lib/validation/config-security.js` GITLEAKS_CHECKSUMS contains verified hashes
- [ ] No "PLACEHOLDER_CHECKSUM" strings exist in security validation code
- [ ] Gitleaks pinned version in code matches documented security version
- [ ] No new security vulnerabilities introduced since audit
- [ ] All security fixes from audit still in place
- [ ] Security audit document references current version (or base version for pre-releases like `4.0.1-rc.1`)

### Real Binary Verification

- [ ] **CRITICAL**: Nightly gitleaks verification workflow is enabled and passing
- [ ] Check last run of `.github/workflows/nightly-gitleaks-verification.yml`
- [ ] No open issues from failed nightly verification runs
- [ ] Production checksums validated in `tests/gitleaks-production-checksums.test.js`
- [ ] Real binary download test passes: `RUN_REAL_BINARY_TEST=1 node tests/gitleaks-real-binary-test.js`
- [ ] CI real binary verification test passes on Linux
- [ ] **BLOCKERS**: If nightly verification failed within 7 days, investigate before release:
  - [ ] Check if gitleaks v8.28.0 assets were modified upstream
  - [ ] Verify checksums against known good values
  - [ ] Ensure no supply chain compromise indicators
  - [ ] Update checksums only if legitimate upstream change confirmed

### Workflow Documentation Alignment

- [ ] GitHub Actions steps match actual workflow files
- [ ] Security scanning steps accurately described
- [ ] Lighthouse CI integration properly documented
- [ ] Python workflow steps match `quality-python.yml`

### Cross-Reference Verification

Run these commands to verify alignment:

```bash
# Check what files setup.js actually creates
grep -n "writeFileSync\|copyFileSync" setup.js

# Compare with README "What Gets Added" section
grep -A 20 "What Gets Added" README.md

# Verify workflow steps match documentation
diff <(grep -E "^      - name:" .github/workflows/quality.yml) \
     <(grep -E "✅.*-" README.md | head -10)
```

## 🧪 Pre-Release Testing

- [ ] `npm test` passes
- [ ] Test in clean directory: `npx create-quality-automation@latest`
- [ ] Verify all documented files are created
- [ ] Check that workflows run successfully

## 📦 Publication Steps

- [ ] Update version: `npm version patch|minor|major`
- [ ] Update CHANGELOG.md with release date
- [ ] Commit changes: `git commit -m "release: vX.X.X"`
- [ ] Create git tag: `git tag vX.X.X`
- [ ] Push: `git push && git push --tags`
- [ ] Publish: `npm publish`

## 🔍 Post-Release Verification

- [ ] npm shows correct version: `npm view create-quality-automation version`
- [ ] GitHub release tagged correctly
- [ ] Documentation renders correctly on npm/GitHub

---

**Remember**: This checklist exists because human memory fails. Use it every time.
