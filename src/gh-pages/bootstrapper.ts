import fs from 'node:fs';
import path from 'node:path';

export interface GhPagesOptions {
  /** Repository root. */
  root: string;
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
        run: npx fea-docs build --out-dir ./dist

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
    fs.writeFileSync(workflowPath, WORKFLOW_YAML);

    if (this.options.generateDocs) {
      const docsPath = path.join(this.options.root, 'docs', 'gh-pages-setup.md');
      fs.mkdirSync(path.dirname(docsPath), { recursive: true });
      fs.writeFileSync(docsPath, `---\ntitle: GitHub Pages Setup\n---\n${SETUP_INSTRUCTIONS}`);
    }

    console.log(`\nGenerated: ${workflowPath}`);
    console.log(SETUP_INSTRUCTIONS);
  }
}
