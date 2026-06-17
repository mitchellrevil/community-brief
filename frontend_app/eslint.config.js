//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config";

const FEATURE_NAMES = [
	"admin",
	"analytics",
	"announcements",
	"prompt-management",
	"recordings",
	"uploads",
	"users",
];

const FEATURE_TEST_IGNORES = [
	"**/*.test.ts",
	"**/*.test.tsx",
	"**/*.spec.ts",
	"**/*.spec.tsx",
	"**/__tests__/**",
];

function escapeForRegex(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createFeatureBoundaryRule(featureName, severity, patterns) {
	const escapedFeatureName = escapeForRegex(featureName);

	return {
		files: [`src/features/${featureName}/**/*.{ts,tsx}`],
		ignores: FEATURE_TEST_IGNORES,
		rules: {
			"no-restricted-imports": [
				severity,
				{
					patterns: patterns.map((pattern) => ({
						regex: pattern(escapedFeatureName),
						message:
							"Cross-feature internals are restricted. Prefer public feature APIs (for example '@/features/<feature>' or '@/features/<feature>/<layer>').",
					})),
				},
			],
		},
	};
}

const featureBoundaryCriticalRules = FEATURE_NAMES.map((featureName) =>
	createFeatureBoundaryRule(featureName, "error", [
		// Critical no-go: state context files are implementation details, not cross-feature contracts.
		(currentFeature) =>
			`^@/features/(?!${currentFeature}(?:/|$))[^/]+/state/context(?:\\?.*)?$`,
		// Critical no-go: deeply nested UI hooks are unstable internal paths.
		(currentFeature) =>
			`^@/features/(?!${currentFeature}(?:/|$))[^/]+/ui/.+/hooks/.+`,
	])
);

const featureBoundaryIncrementalRules = FEATURE_NAMES.map((featureName) =>
	createFeatureBoundaryRule(featureName, "warn", [
		// Incremental adoption: discourage deep imports into another feature's internals.
		(currentFeature) =>
			`^@/features/(?!${currentFeature}(?:/|$))[^/]+/(?:data|ui|state|pages|media|recording)/.+`,
	])
);

export default [
	{
		ignores: [
			"eslint.config.js",
			"prettier.config.js",
			"tailwind.config.js",
			"vite.config.js",
			"src/env.d.ts",
		],
	},
	...tanstackConfig,
	...featureBoundaryCriticalRules,
	...featureBoundaryIncrementalRules,
];
