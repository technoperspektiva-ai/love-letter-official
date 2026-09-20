# GitHub Actions hotfix

This build removes `cache: npm` from `actions/setup-node` because the repository does not contain a lockfile. That failure previously stopped CI before install/deploy.
