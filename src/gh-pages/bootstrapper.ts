import fs from 'node:fs';
import path from 'node:path';
import { normalizeBasePath } from '../utils/base-path.js';

export interface GhPagesOptions {
  /** Repository root. */
  root: string;
  /** Base path used by deployed docs (e.g. /my-repo). */
  base?: string;
  /** Whether to generate deployment docs. */
  generateDocs?: boolean;
}

const WORKFLOW_YAML = `name: Deploy docs to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Build docs
        run: __FEA_DOCS_BUILD_COMMAND__

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`;

const SETUP_INSTRUCTIONS = `
## GitHub Pages Setup Instructions

After running \`fea-docs setup --gh-pages\`, complete these steps:

1. **Commit the workflow file:**
   \`\`\`
   git add .github/workflows/deploy-docs.yml
   git commit -m "chore: add fea-docs GitHub Pages deployment workflow"
   git push
   \`\`\`

2. **Enable GitHub Pages in repository settings:**
   - Go to your repository on GitHub.
   - Navigate to **Settings > Pages**.
   - Under **Build and deployment > Source**, select **GitHub Actions**.

3. **Trigger the workflow:**
   - Push to the \`main\` branch, or manually trigger via Actions tab.

4. **Verify deployment:**
   - Your docs will be available at \`https://<username>.github.io/<repo>/\` (or your custom domain).

> **Note:** Ensure your repository has GitHub Actions enabled and Pages permissions are set correctly.
`;

/**
 * GithubPagesBootstrapper generates the GitHub Actions workflow file
 * and prints setup instructions for deploying docs to GitHub Pages.
 */
export class GithubPagesBootstrapper {
  private options: GhPagesOptions;

  constructor(options: GhPagesOptions) {
    this.options = options;
  }

  async bootstrap(): Promise<void> {
    const workflowDir = path.join(this.options.root, '.github', 'workflows');
    fs.mkdirSync(workflowDir, { recursive: true });

    const workflowPath = path.join(workflowDir, 'deploy-docs.yml');
    fs.writeFileSync(workflowPath, this.buildWorkflowYaml());

    if (this.options.generateDocs) {
      const docsPath = path.join(this.options.root, 'docs', 'gh-pages-setup.md');
      fs.mkdirSync(path.dirname(docsPath), { recursive: true });
      fs.writeFileSync(docsPath, `---\ntitle: GitHub Pages Setup\n---\n${this.setupInstructions()}`);
    }

    console.log(`\nGenerated: ${workflowPath}`);
    console.log(this.setupInstructions());
  }

  private buildWorkflowYaml(): string {
    const normalizedBase = this.options.base ? normalizeBasePath(this.options.base) : undefined;
    const baseFlag = normalizedBase ? ` --base ${JSON.stringify(normalizedBase)}` : '';
    const buildCommand = `npx fea-docs build --out-dir ./dist${baseFlag}`;
    return WORKFLOW_YAML.replace('__FEA_DOCS_BUILD_COMMAND__', buildCommand);
  }

  private setupInstructions(): string {
    const normalizedBase = this.options.base ? normalizeBasePath(this.options.base) : undefined;
    const baseNote = this.options.base
      ? `\nConfigured base path: \`${normalizedBase}\`.\n`
      : '\nIf deploying to a GitHub Pages project site, pass --base /<repo> to fea-docs build.\n';
    return `${SETUP_INSTRUCTIONS}${baseNote}`;
  }
}
