import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type RouteModule = { Route?: unknown };

const lazyRouteModules = import.meta.glob('../../routes/**/index.lazy.tsx');
const mainRouteModules = import.meta.glob('../../routes/**/index.tsx');

const expectedCriticalLazyRoutes = [
  '../../routes/_layout/analytics/index.lazy.tsx',
  '../../routes/_layout/prompt-management/index.lazy.tsx',
  '../../routes/_layout/admin/all-jobs/index.lazy.tsx',
  '../../routes/_layout/admin/announcements/index.lazy.tsx',
  '../../routes/_layout/admin/deleted-jobs/index.lazy.tsx',
  '../../routes/_layout/admin/user-management/index.lazy.tsx',
];

function toMainRoutePath(lazyRoutePath: string): string {
  return lazyRoutePath.replace('/index.lazy.tsx', '/index.tsx');
}

function toRouteTreeLazyImport(lazyRoutePath: string): string {
  const routePathWithoutExtension = lazyRoutePath
    .replace('../../routes/', './routes/')
    .replace('.tsx', '');
  return `import('${routePathWithoutExtension}')`;
}

const currentFileDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(currentFileDir, '../../..');
const routeTreePath = resolve(frontendRoot, 'src/routeTree.gen.ts');
const viteConfigPath = resolve(frontendRoot, 'vite.config.js');

describe('Route-Level Code Splitting', () => {
  it('discovers all critical lazy route files', () => {
    const lazyPaths = Object.keys(lazyRouteModules);

    for (const expectedRoutePath of expectedCriticalLazyRoutes) {
      expect(lazyPaths, `${expectedRoutePath} should exist`).toContain(
        expectedRoutePath,
      );
    }
  });

  it('exports Route from every discovered lazy route module', () => {
    for (const lazyRoutePath of Object.keys(lazyRouteModules)) {
      const lazyRouteFile = resolve(currentFileDir, lazyRoutePath);
      const source = readFileSync(lazyRouteFile, 'utf-8');

      expect(source, `${lazyRoutePath} should export Route`).toMatch(
        /export\s+const\s+Route\s*=\s*createLazyFileRoute\(/,
      );
    }
  });

  it('has a matching main route file for every lazy route file', () => {
    const mainRoutePaths = new Set(Object.keys(mainRouteModules));

    for (const lazyRoutePath of Object.keys(lazyRouteModules)) {
      const mainRoutePath = toMainRoutePath(lazyRoutePath);
      expect(
        mainRoutePaths.has(mainRoutePath),
        `${mainRoutePath} should exist for ${lazyRoutePath}`,
      ).toBe(true);
    }
  });

  it('keeps main route files free of inline route components when lazy files exist', () => {
    for (const lazyRoutePath of Object.keys(lazyRouteModules)) {
      const mainRoutePath = toMainRoutePath(lazyRoutePath);
      const mainRouteFile = resolve(currentFileDir, mainRoutePath);
      const source = readFileSync(mainRouteFile, 'utf-8');

      expect(source).toContain('createFileRoute(');
      expect(
        source,
        `${mainRoutePath} should defer component to ${lazyRoutePath}`,
      ).not.toContain('component:');
    }
  });

  it('registers lazy imports for each lazy route in generated routeTree', () => {
    const routeTreeSource = readFileSync(routeTreePath, 'utf-8');

    for (const lazyRoutePath of Object.keys(lazyRouteModules)) {
      expect(routeTreeSource).toContain(toRouteTreeLazyImport(lazyRoutePath));
    }
  });
});

describe('Build Chunk Configuration', () => {
  it('keeps TanStack Router auto code splitting enabled', () => {
    const viteConfigSource = readFileSync(viteConfigPath, 'utf-8');

    expect(viteConfigSource).toContain(
      'TanStackRouterVite({ autoCodeSplitting: true })',
    );
  });

  it('defines core vendor chunk groups', () => {
    const viteConfigSource = readFileSync(viteConfigPath, 'utf-8');

    expect(viteConfigSource).toContain("'react-vendor'");
    expect(viteConfigSource).toContain("'router-vendor'");
    expect(viteConfigSource).toContain("'query-vendor'");
    expect(viteConfigSource).toContain("'radix-ui'");
  });
});
