# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
- Ported robust CI/CD workflows and templates from `mirrowell-github`
- Integrated `git-cliff` for automated changelog generation
- Added `cleanup.yml` for automated release pruning
- Added comprehensive issue templates and repository configurations (`CODEOWNERS`, `FUNDING.yml`)
- Standardized all GitHub Actions to stable `@v4` (fixing invalid `@v6` references)
- Added AI reference prompts in `docs/prompts/`
- Updated GitHub Actions to v4 (`checkout`, `setup-node`, `upload-artifact`)
- Upgraded TypeScript to v5.9.3
- Upgraded Chai to v6.2.2
- Upgraded UUID to v13.0.0
- Updated `@types/node` and other dependency groups
- Fixed redundant type definitions for `uuid`
- Initial setup of CI/CD pipeline
- Automated .vsix packaging
- Version management scripts
