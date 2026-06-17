/* eslint-disable @typescript-eslint/require-await */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock FFmpeg class
const mockLoad = vi.fn();
const mockWriteFile = vi.fn();
const mockExec = vi.fn();
const mockReadFile = vi.fn();
const mockDeleteFile = vi.fn();

const mockFFmpegInstance = {
  loaded: false,
  load: mockLoad,
  writeFile: mockWriteFile,
  exec: mockExec,
  readFile: mockReadFile,
  deleteFile: mockDeleteFile,
  on: vi.fn(),
  off: vi.fn(),
};

// We need to track instances to verify singleton behavior
let createdInstances = 0;

vi.mock('@ffmpeg/ffmpeg', () => {
  return {
    FFmpeg: class {
      constructor() {
        createdInstances++;
        return mockFFmpegInstance;
      }
    },
  };
});

// Helper to create mock File object
function createMockFile(name: string, type: string): File {
  const blob = new Blob(['test audio data'], { type });
  return new File([blob], name, { type });
}

describe('FFmpeg Singleton', () => {
  beforeEach(() => {
    vi.resetModules(); // Reset module registry to get fresh singleton for each test
    vi.clearAllMocks();
    createdInstances = 0;
    mockFFmpegInstance.loaded = false;
    
    // Fix Blob.arrayBuffer if missing in JSDOM environment
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!Blob.prototype.arrayBuffer) {
        Object.defineProperty(Blob.prototype, 'arrayBuffer', {
            configurable: true,
            value: function() {
                return Promise.resolve(new ArrayBuffer(0));
            }
        });
    }

    // Mock successful execution
    mockReadFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mockLoad.mockImplementation(async () => {
        mockFFmpegInstance.loaded = true;
    });
  });

  async function importModule() {
      return await import('@/lib/audio-compression');
  }

  it('should reuse the same FFmpeg instance across multiple calls', async () => {
    const { compressAudioToMP3 } = await importModule();
    
    // 1. Arrange
    const blob1 = new Blob(['audio1'], { type: 'audio/wav' });
    const blob2 = new Blob(['audio2'], { type: 'audio/wav' });

    // 2. Act
    await compressAudioToMP3(blob1);
    await compressAudioToMP3(blob2);

    // 3. Assert
    expect(createdInstances).toBe(1);
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(mockExec).toHaveBeenCalledTimes(2);
  });

  it('should handle concurrent initialization correctly', async () => {
    const { compressAudioToMP3 } = await importModule();
    
    // 1. Arrange
    const blob1 = new Blob(['audio1'], { type: 'audio/wav' });
    const blob2 = new Blob(['audio2'], { type: 'audio/wav' });
    
    // Simulate slow load
    mockLoad.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        mockFFmpegInstance.loaded = true;
    });

    const initialCreatedCount = createdInstances;

    // 2. Act - call in parallel
    await Promise.all([
        compressAudioToMP3(blob1),
        compressAudioToMP3(blob2)
    ]);

    // 3. Assert
    // Since we called resetModules(), we expect fresh start = 1 instance.
    expect(createdInstances).toBe(1);
    expect(mockExec).toHaveBeenCalledTimes(2);
  });

  it('should reset initialization promise on failure', async () => {
    const { compressAudioToMP3 } = await importModule();
    
    const blob = new Blob(['test'], { type: 'audio/wav' });
    const initialCount = createdInstances; // Should be 0

    // 1. First call fails during load
    mockLoad.mockRejectedValueOnce(new Error('Init failed'));
    
    // We expect compressAudioToMP3 to catch the error and return the blob
    await compressAudioToMP3(blob); 
    
    // Should have created an instance (tried to)
    expect(createdInstances).toBe(1);

    // 2. Second call succeeds
    mockLoad.mockImplementationOnce(async () => { mockFFmpegInstance.loaded = true; });
    
    await compressAudioToMP3(blob);
    
    // Should have created ANOTHER instance because previous one failed and was nullified
    expect(createdInstances).toBe(2);
    
    // 3. Third call reuses
    await compressAudioToMP3(blob);
    expect(createdInstances).toBe(2); // Should not increase
  });
});

describe('FFmpeg Cross-Module Singleton', () => {
  beforeEach(() => {
    vi.resetModules(); // Reset module registry to get fresh singleton for each test
    vi.clearAllMocks();
    createdInstances = 0;
    mockFFmpegInstance.loaded = false;
    
    // Fix Blob.arrayBuffer if missing in JSDOM environment
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!Blob.prototype.arrayBuffer) {
        Object.defineProperty(Blob.prototype, 'arrayBuffer', {
            configurable: true,
            value: function() {
                return Promise.resolve(new ArrayBuffer(0));
            }
        });
    }

    // Mock successful execution
    mockReadFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mockLoad.mockImplementation(async () => {
        mockFFmpegInstance.loaded = true;
    });
  });

  it('should share FFmpeg instance between WAV conversion and MP3 compression', async () => {
    // Import both modules - they should share the same singleton
    const { compressAudioToMP3 } = await import('@/lib/audio-compression');
    const { convertToWavWithFFmpeg } = await import('@/lib/ffmpegConvert');
    
    // 1. Arrange
    const blob = new Blob(['audio data'], { type: 'audio/wav' });
    const mp3File = createMockFile('test.mp3', 'audio/mpeg');
    
    // 2. Act - use both conversion and compression
    await compressAudioToMP3(blob);
    await convertToWavWithFFmpeg(mp3File);
    
    // 3. Assert - FFmpeg.load() should only be called once
    expect(createdInstances).toBe(1);
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(mockExec).toHaveBeenCalledTimes(2); // Both operations should execute
  });

  it('should share FFmpeg instance when WAV conversion is called first', async () => {
    const { convertToWavWithFFmpeg } = await import('@/lib/ffmpegConvert');
    const { compressAudioToMP3 } = await import('@/lib/audio-compression');
    
    // 1. Arrange
    const mp3File = createMockFile('test.mp3', 'audio/mpeg');
    const blob = new Blob(['audio data'], { type: 'audio/wav' });
    
    // 2. Act - WAV conversion first, then MP3 compression
    await convertToWavWithFFmpeg(mp3File);
    await compressAudioToMP3(blob);
    
    // 3. Assert
    expect(createdInstances).toBe(1);
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(mockExec).toHaveBeenCalledTimes(2);
  });

  it('should reuse instance across multiple WAV conversions', async () => {
    const { convertToWavWithFFmpeg } = await import('@/lib/ffmpegConvert');
    
    // 1. Arrange
    const file1 = createMockFile('audio1.mp3', 'audio/mpeg');
    const file2 = createMockFile('audio2.mp3', 'audio/mpeg');
    const file3 = createMockFile('audio3.mp3', 'audio/mpeg');
    
    // 2. Act - multiple conversions
    await convertToWavWithFFmpeg(file1);
    await convertToWavWithFFmpeg(file2);
    await convertToWavWithFFmpeg(file3);
    
    // 3. Assert - only one instance created
    expect(createdInstances).toBe(1);
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(mockExec).toHaveBeenCalledTimes(3);
  });

  it('should handle concurrent cross-module operations', async () => {
    const { compressAudioToMP3 } = await import('@/lib/audio-compression');
    const { convertToWavWithFFmpeg } = await import('@/lib/ffmpegConvert');
    
    // 1. Arrange
    const blob = new Blob(['audio'], { type: 'audio/wav' });
    const file = createMockFile('test.mp3', 'audio/mpeg');
    
    // Simulate slow load
    mockLoad.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        mockFFmpegInstance.loaded = true;
    });

    // 2. Act - concurrent operations from different modules
    await Promise.all([
        compressAudioToMP3(blob),
        convertToWavWithFFmpeg(file)
    ]);
    
    // 3. Assert - still only one instance
    expect(createdInstances).toBe(1);
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(mockExec).toHaveBeenCalledTimes(2);
  });

  it('should export getFFmpeg function for shared access', async () => {
    const audioCompression = await import('@/lib/audio-compression');
    
    // getFFmpeg should be exported
    expect(audioCompression.getFFmpeg).toBeDefined();
    expect(typeof audioCompression.getFFmpeg).toBe('function');
  });
});
