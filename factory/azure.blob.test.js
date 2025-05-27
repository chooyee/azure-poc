const AzureBlobFactory = require('./azure.blob');
const { BlobServiceClient } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');
const { Readable } = require('stream');

// Mock Azure dependencies
jest.mock('@azure/storage-blob');
jest.mock('@azure/identity');

describe('AzureBlobFactory', () => {
    let azureBlobFactory;
    let mockContainerClient;
    let mockBlobServiceClient;
    let mockBlockBlobClient;
    let mockCredential;

    const testOptions = {
        accountName: 'testaccount',
        containerName: 'testcontainer'
    };

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Mock DefaultAzureCredential
        mockCredential = {};
        DefaultAzureCredential.mockImplementation(() => mockCredential);

        // Mock BlockBlobClient
        mockBlockBlobClient = {
            upload: jest.fn(),
            download: jest.fn(),
            deleteIfExists: jest.fn(),
            url: 'https://testaccount.blob.core.windows.net/testcontainer/testblob'
        };

        // Mock ContainerClient
        mockContainerClient = {
            containerName: testOptions.containerName,
            exists: jest.fn(),
            create: jest.fn(),
            getBlockBlobClient: jest.fn(() => mockBlockBlobClient),
            listBlobsFlat: jest.fn()
        };

        // Mock BlobServiceClient
        mockBlobServiceClient = {
            getContainerClient: jest.fn(() => mockContainerClient)
        };

        BlobServiceClient.mockImplementation(() => mockBlobServiceClient);

        // Create instance
        azureBlobFactory = new AzureBlobFactory(testOptions);
    });

    describe('Constructor', () => {
        it('should create instance with valid options', () => {
            expect(azureBlobFactory).toBeInstanceOf(AzureBlobFactory);
            expect(azureBlobFactory.options).toEqual(testOptions);
            expect(DefaultAzureCredential).toHaveBeenCalled();
            expect(BlobServiceClient).toHaveBeenCalledWith(
                'https://testaccount.blob.core.windows.net',
                mockCredential
            );
            expect(mockBlobServiceClient.getContainerClient).toHaveBeenCalledWith('testcontainer');
        });

        it('should throw error when accountName is missing', () => {
            expect(() => {
                new AzureBlobFactory({ containerName: 'test' });
            }).toThrow('Azure storage account name is required');
        });

        it('should throw error when containerName is missing', () => {
            expect(() => {
                new AzureBlobFactory({ accountName: 'test' });
            }).toThrow('Azure container name is required');
        });

        it('should throw error when both options are missing', () => {
            expect(() => {
                new AzureBlobFactory({});
            }).toThrow('Azure storage account name is required');
        });
    });

    describe('initContainer', () => {
        it('should create container when it does not exist', async () => {
            mockContainerClient.exists.mockResolvedValue(false);
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await azureBlobFactory.initContainer();

            expect(mockContainerClient.exists).toHaveBeenCalled();
            expect(mockContainerClient.create).toHaveBeenCalled();
            expect(consoleSpy).toHaveBeenCalledWith('Container "testcontainer" created.');
            
            consoleSpy.mockRestore();
        });

        it('should not create container when it already exists', async () => {
            mockContainerClient.exists.mockResolvedValue(true);
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await azureBlobFactory.initContainer();

            expect(mockContainerClient.exists).toHaveBeenCalled();
            expect(mockContainerClient.create).not.toHaveBeenCalled();
            expect(consoleSpy).toHaveBeenCalledWith('Container "testcontainer" already exists.');
            
            consoleSpy.mockRestore();
        });
    });

    describe('uploadBlob', () => {
        it('should upload string content successfully', async () => {
            const blobName = 'test.txt';
            const content = 'test content';
            const expectedBuffer = Buffer.from(content);

            await azureBlobFactory.uploadBlob(blobName, content);

            expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith(blobName);
            expect(mockBlockBlobClient.upload).toHaveBeenCalledWith(expectedBuffer, expectedBuffer.length);
        });

        it('should upload buffer content successfully', async () => {
            const blobName = 'test.txt';
            const content = Buffer.from('test content');

            await azureBlobFactory.uploadBlob(blobName, content);

            expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith(blobName);
            expect(mockBlockBlobClient.upload).toHaveBeenCalledWith(content, content.length);
        });

        it('should throw error when upload fails', async () => {
            const blobName = 'test.txt';
            const content = 'test content';
            const uploadError = new Error('Upload failed');
            mockBlockBlobClient.upload.mockRejectedValue(uploadError);

            await expect(azureBlobFactory.uploadBlob(blobName, content))
                .rejects.toThrow(`UploadBlob [${blobName}] Failed: Error: Upload failed`);
        });
    });

    describe('listBlobs', () => {
        it('should return list of blob names', async () => {
            const mockBlobs = [
                { name: 'blob1.txt' },
                { name: 'blob2.txt' },
                { name: 'blob3.txt' }
            ];
            
            // Mock async iterator
            mockContainerClient.listBlobsFlat.mockReturnValue({
                [Symbol.asyncIterator]: async function* () {
                    for (const blob of mockBlobs) {
                        yield blob;
                    }
                }
            });

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            const result = await azureBlobFactory.listBlobs();

            expect(result).toEqual(['blob1.txt', 'blob2.txt', 'blob3.txt']);
            expect(consoleSpy).toHaveBeenCalledWith('Container contains: blob1.txt, blob2.txt, blob3.txt');
            
            consoleSpy.mockRestore();
        });

        it('should return empty array when no blobs exist', async () => {
            mockContainerClient.listBlobsFlat.mockReturnValue({
                [Symbol.asyncIterator]: async function* () {
                    // Empty iterator
                }
            });

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            const result = await azureBlobFactory.listBlobs();

            expect(result).toEqual([]);
            expect(consoleSpy).toHaveBeenCalledWith('Container contains: ');
            
            consoleSpy.mockRestore();
        });
    });

    describe('readBlob', () => {
        it('should read blob content as string', async () => {
            const blobName = 'test.txt';
            const expectedContent = 'test content';
            
            // Create a mock stream for _streamToString
            const mockStream = {
                on: jest.fn((event, callback) => {
                    if (event === 'data') {
                        process.nextTick(() => callback(Buffer.from(expectedContent)));
                    } else if (event === 'end') {
                        process.nextTick(() => {
                            setTimeout(() => callback(), 1);
                        });
                    }
                })
            };

            mockBlockBlobClient.download.mockResolvedValue({
                readableStreamBody: mockStream
            });

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            const result = await azureBlobFactory.readBlob(blobName);

            expect(result).toBe(expectedContent);
            expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith(blobName);
            expect(mockBlockBlobClient.download).toHaveBeenCalled();
            expect(consoleSpy).toHaveBeenCalledWith('Blob "test.txt" read.');
            
            consoleSpy.mockRestore();
        });
    });

    describe('readBlobAsBuffer', () => {
        it('should read blob content as buffer', async () => {
            const blobName = 'test.txt';
            const expectedContent = 'test content';
            
            // Create a mock stream that emits data immediately when listeners are attached
            const mockStream = {
                on: jest.fn((event, callback) => {
                    if (event === 'data') {
                        // Simulate data emission
                        process.nextTick(() => callback(Buffer.from(expectedContent)));
                    } else if (event === 'end') {
                        // Simulate end emission after data
                        process.nextTick(() => {
                            setTimeout(() => callback(), 1);
                        });
                    }
                })
            };
            
            mockBlockBlobClient.download.mockResolvedValue({
                readableStreamBody: mockStream
            });

            const result = await azureBlobFactory.readBlobAsBuffer(blobName);

            expect(Buffer.isBuffer(result)).toBe(true);
            expect(result.toString()).toBe(expectedContent);
            expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith(blobName);
            expect(mockBlockBlobClient.download).toHaveBeenCalled();
        });

        it('should handle multiple data chunks', async () => {
            const blobName = 'test.txt';
            const chunk1 = 'test ';
            const chunk2 = 'content';
            
            // Create a mock stream that emits multiple chunks
            const mockStream = {
                on: jest.fn((event, callback) => {
                    if (event === 'data') {
                        // Simulate multiple data emissions
                        process.nextTick(() => {
                            callback(Buffer.from(chunk1));
                            callback(Buffer.from(chunk2));
                        });
                    } else if (event === 'end') {
                        // Simulate end emission after data
                        process.nextTick(() => {
                            setTimeout(() => callback(), 2);
                        });
                    }
                })
            };
            
            mockBlockBlobClient.download.mockResolvedValue({
                readableStreamBody: mockStream
            });

            const result = await azureBlobFactory.readBlobAsBuffer(blobName);

            expect(result.toString()).toBe('test content');
        });

        it('should throw error when read fails', async () => {
            const blobName = 'test.txt';
            const readError = new Error('Read failed');
            mockBlockBlobClient.download.mockRejectedValue(readError);

            await expect(azureBlobFactory.readBlobAsBuffer(blobName))
                .rejects.toThrow(`readBlobAsBuffer [${blobName}] Failed: Error: Read failed`);
        });

        it('should handle stream error', async () => {
            const blobName = 'test.txt';
            const streamError = new Error('Stream error');
            
            // Create a mock stream that emits error
            const mockStream = {
                on: jest.fn((event, callback) => {
                    if (event === 'error') {
                        // Simulate error emission
                        process.nextTick(() => callback(streamError));
                    }
                })
            };
            
            mockBlockBlobClient.download.mockResolvedValue({
                readableStreamBody: mockStream
            });

            await expect(azureBlobFactory.readBlobAsBuffer(blobName))
                .rejects.toThrow('Stream error');
        });
    });

    describe('deleteBlob', () => {
        it('should delete blob successfully', async () => {
            const blobName = 'test.txt';
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await azureBlobFactory.deleteBlob(blobName);

            expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith(blobName);
            expect(mockBlockBlobClient.deleteIfExists).toHaveBeenCalled();
            expect(consoleSpy).toHaveBeenCalledWith('Blob "test.txt" deleted (if it existed).');
            
            consoleSpy.mockRestore();
        });
    });

    describe('getBlobUrl', () => {
        it('should return blob URL', () => {
            const blobName = 'test.txt';

            const result = azureBlobFactory.getBlobUrl(blobName);

            expect(result).toBe('https://testaccount.blob.core.windows.net/testcontainer/testblob');
            expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith(blobName);
        });
    });

    describe('_streamToString', () => {
        it('should convert readable stream to string', async () => {
            const testContent = 'test content';
            
            // Create a mock stream
            const mockStream = {
                on: jest.fn((event, callback) => {
                    if (event === 'data') {
                        process.nextTick(() => callback(testContent));
                    } else if (event === 'end') {
                        process.nextTick(() => {
                            setTimeout(() => callback(), 1);
                        });
                    }
                })
            };

            const result = await azureBlobFactory._streamToString(mockStream);

            expect(result).toBe(testContent);
        });

        it('should handle multiple data chunks', async () => {
            // Create a mock stream that emits multiple chunks
            const mockStream = {
                on: jest.fn((event, callback) => {
                    if (event === 'data') {
                        process.nextTick(() => {
                            callback('test ');
                            callback('content');
                        });
                    } else if (event === 'end') {
                        process.nextTick(() => {
                            setTimeout(() => callback(), 2);
                        });
                    }
                })
            };

            const result = await azureBlobFactory._streamToString(mockStream);

            expect(result).toBe('test content');
        });

        it('should handle stream error', async () => {
            const streamError = new Error('Stream error');
            
            // Create a mock stream that emits error
            const mockStream = {
                on: jest.fn((event, callback) => {
                    if (event === 'error') {
                        process.nextTick(() => callback(streamError));
                    }
                })
            };

            await expect(azureBlobFactory._streamToString(mockStream))
                .rejects.toThrow('Stream error');
        });
    });
});