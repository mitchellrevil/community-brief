import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadConstantsWithApiUrl(apiUrl: string) {
	vi.stubEnv('VITE_API_URL', apiUrl);
	vi.resetModules();
	return await import('@/shared/api/constants');
}

describe('API constants', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it('does not duplicate the api path when VITE_API_URL ends in /api', async () => {
		const constants = await loadConstantsWithApiUrl('http://localhost:8000/api');

		expect(constants.API_V1_BASE).toBe('http://localhost:8000/api/v1');
		expect(constants.AUTH_ME_API).toBe('http://localhost:8000/api/v1/auth/me');
	});

	it('keeps normal backend roots working', async () => {
		const constants = await loadConstantsWithApiUrl('http://localhost:8000');

		expect(constants.API_V1_BASE).toBe('http://localhost:8000/api/v1');
		expect(constants.HEALTH_READY).toBe('http://localhost:8000/health/ready');
	});
});
