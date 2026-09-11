# Main integration verification — September 11, 2026

Integrated the native iOS application and Apple/OpenAI briefing work with main at `d844291` (sunrise and sunset forecast section). The merge combined automatically; the existing sunrise/sunset components, icons, and tests match main exactly, and their CSS is retained alongside native safe-area styling.

The backend compatibility files match the isolated source already deployed in `dpl_GJg4JmuXWvXJXg471mRQq6YAfUVr`. The OpenAI credential remains server-side, and the configured server model is unchanged.

| Check on combined source | Result |
| --- | --- |
| Frontend unit tests | 233 passed |
| Server unit tests | 37 passed; 3 opt-in paid tests skipped |
| Native Node ESM function smoke | Passed |
| ESLint and TypeScript | Passed |
| Website production build | Passed |
| Website Chromium/WebKit tests | 155 passed; 9 intentional capability skips |
| Native Chromium/WebKit tests | 26 passed, mocked native/provider transport |
| Swift widget checks | 40 passed |
| Native build and Capacitor sync | Passed |
| Native bundle checks | Passed: bundled shell/art, no service worker or embedded provider key |
| App and widget simulator build | Passed with Xcode 26.6, ad-hoc signed |
| Website asset budget | 2341.2 KiB / 3 MB |
| Git whitespace and credential-pattern scan | Passed |

Logs are retained locally at `/tmp/eightbit-merged-{unit,lint,build,browser,native-browser,widget,sync,ios-build}.log`. The production build emits Vite's advisory about the main JavaScript chunk exceeding 500 kB; the repository's total asset budget passes.

This integration updates local main only. No Git push or additional deployment is included. Physical iPhone checks were completed before integration and are documented in [device verification](evidence/iphone-development/README.md); the post-integration native check here is a simulator build. Actual iOS 27 Apple model quality and physical Home Screen widget behavior remain unverified.
