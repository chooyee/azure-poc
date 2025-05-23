const AzureBlobFactory = require('./azure.blob.js'); 
const { BlobServiceClient } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');

jest.mock('@azure/identity');
jest.mock('@azure/storage-blob');

describe('AzureBlobFactory', () => {
  let mockBlobServiceClient;
  let mockContainerClient;
  let mockBlockBlobClient;
  let mockDefaultAzureCredentialInstance; 

  const options = { accountName: 'testaccount', containerName: 'testcontainer' };

  beforeEach(() => {
    jest.resetAllMocks(); 

    mockDefaultAzureCredentialInstance = { };
    DefaultAzureCredential.mockImplementation(() => mockDefaultAzureCredentialInstance);

    mockBlockBlobClient = {
      upload: jest.fn().mockResolvedValue({ }),
      download: jest.fn().mockResolvedValue({ 
        readableStreamBody: { 
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from('mock data chunk 1'));
              callback(Buffer.from('mock data chunk 2'));
            }
            if (event === 'end') {
              callback();
            }
            return { on: jest.fn().mockReturnThis() }; 
          }),
          pipe: jest.fn(destination => { 
            destination.write(Buffer.from('mock data chunk 1'));
            destination.write(Buffer.from('mock data chunk 2'));
            destination.end();
            return destination; 
          })
        }
      }),
      deleteIfExists: jest.fn().mockResolvedValue({ }),
      url: 'https://testaccount.blob.core.windows.net/testcontainer/testblob.txt'
    };

    mockContainerClient = {
      exists: jest.fn().mockResolvedValue(true),
      create: jest.fn().mockResolvedValue({ }),
      getBlockBlobClient: jest.fn().mockReturnValue(mockBlockBlobClient),
      listBlobsFlat: jest.fn().mockImplementation(async function*() { 
        yield { name: 'blob1.txt' };
        yield { name: 'blob2.txt' };
      }),
      containerName: options.containerName
    };

    mockBlobServiceClient = {
      getContainerClient: jest.fn().mockReturnValue(mockContainerClient)
    };
    BlobServiceClient.mockImplementation(() => mockBlobServiceClient);
  });

  describe('Constructor', () => {
    test('should initialize BlobServiceClient and ContainerClient correctly', () => {
      new AzureBlobFactory(options);
      expect(DefaultAzureCredential).toHaveBeenCalledTimes(1);
      expect(BlobServiceClient).toHaveBeenCalledWith(`https://${options.accountName}.blob.core.windows.net`, mockDefaultAzureCredentialInstance);
      expect(mockBlobServiceClient.getContainerClient).toHaveBeenCalledWith(options.containerName);
    });

    test('should throw error if accountName is missing', () => {
      expect(() => new AzureBlobFactory({ containerName: 'test' })).toThrow('Azure storage account name is required');
    });
    
    test('should throw error if containerName is missing', () => {
      expect(() => new AzureBlobFactory({ accountName: 'test' })).toThrow('Azure container name is required');
    });
  });

  describe('initContainer', () => {
    test('should create container if it does not exist', async () => {
      mockContainerClient.exists.mockResolvedValue(false);
      const factory = new AzureBlobFactory(options);
      await factory.initContainer();
      expect(mockContainerClient.exists).toHaveBeenCalledTimes(1);
      expect(mockContainerClient.create).toHaveBeenCalledTimes(1);
    });

    test('should not create container if it already exists', async () => {
      mockContainerClient.exists.mockResolvedValue(true);
      const factory = new AzureBlobFactory(options);
      await factory.initContainer();
      expect(mockContainerClient.exists).toHaveBeenCalledTimes(1);
      expect(mockContainerClient.create).not.toHaveBeenCalled();
    });

    test('should throw prefixed error if containerClient.exists fails', async () => {
      const existsError = new Error('Exists check failed');
      mockContainerClient.exists.mockRejectedValue(existsError);
      const factory = new AzureBlobFactory(options);
      await expect(factory.initContainer()).rejects.toThrow(`initContainer [${options.containerName}] Failed: Exists check failed`);
    });

    test('should throw prefixed error if containerClient.create fails', async () => {
      const createError = new Error('Container creation failed');
      mockContainerClient.exists.mockResolvedValue(false);
      mockContainerClient.create.mockRejectedValue(createError);
      const factory = new AzureBlobFactory(options);
      await expect(factory.initContainer()).rejects.toThrow(`initContainer [${options.containerName}] Failed: Container creation failed`);
    });
  });

  describe('uploadBlob', () => {
    test('should upload string content to a block blob', async () => {
      const factory = new AzureBlobFactory(options);
      const blobName = 'test.txt';
      const content = 'Hello Azure!';
      await factory.uploadBlob(blobName, content);
      expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith(blobName);
      const expectedBuffer = Buffer.from(content);
      expect(mockBlockBlobClient.upload).toHaveBeenCalledWith(expectedBuffer, expectedBuffer.length);
    });
    
    test('should upload Buffer content to a block blob', async () => {
      const factory = new AzureBlobFactory(options);
      const blobName = 'test.bin';
      const content = Buffer.from([0x01, 0x02, 0x03]);
      await factory.uploadBlob(blobName, content);
      expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith(blobName);
      expect(mockBlockBlobClient.upload).toHaveBeenCalledWith(content, content.length);
    });

    test('should throw prefixed error if upload fails', async () => {
        const uploadError = new Error('Upload failed');
        mockBlockBlobClient.upload.mockRejectedValue(uploadError);
        const factory = new AzureBlobFactory(options);
        const blobName = 'test.txt';
        const content = 'Hello Azure!';
        await expect(factory.uploadBlob(blobName, content)).rejects.toThrow(`UploadBlob [test.txt] Failed: Error: Upload failed`);
    });
  });

  describe('listBlobs', () => {
    test('should list all blobs in the container', async () => {
      const factory = new AzureBlobFactory(options);
      const blobNames = await factory.listBlobs();
      expect(mockContainerClient.listBlobsFlat).toHaveBeenCalledTimes(1);
      expect(blobNames).toEqual(['blob1.txt', 'blob2.txt']);
    });

    test('should throw prefixed error if listBlobsFlat fails', async () => {
      const listError = new Error('Listing failed');
      mockContainerClient.listBlobsFlat = jest.fn(async function*() {
        throw listError;
      });
      const factory = new AzureBlobFactory(options);
      await expect(factory.listBlobs()).rejects.toThrow(`listBlobs [${options.containerName}] Failed: Listing failed`);
    });
  });

  describe('readBlob', () => {
    test('should read content of a blob as string', async () => {
      const factory = new AzureBlobFactory(options);
      const blobName = 'test.txt';
      const content = await factory.readBlob(blobName);
      expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith(blobName);
      expect(mockBlockBlobClient.download).toHaveBeenCalledTimes(1);
      expect(content).toBe('mock data chunk 1mock data chunk 2');
    });

    test('should throw prefixed error if download fails for readBlob', async () => {
        const downloadError = new Error('Download failed');
        mockBlockBlobClient.download.mockRejectedValue(downloadError);
        const factory = new AzureBlobFactory(options);
        const blobName = 'test.txt';
        await expect(factory.readBlob(blobName)).rejects.toThrow(`readBlob [test.txt] Failed: Download failed`);
    });

    test('should correctly handle stream error for readBlob', async () => {
      const streamError = new Error('Stream error in readBlob');
      mockBlockBlobClient.download.mockResolvedValue({
        readableStreamBody: {
          on: jest.fn((event, callback) => {
            if (event === 'error') { 
              callback(streamError);
            }
            return { on: jest.fn().mockReturnThis() }; 
          }),
          pipe: jest.fn(), 
        }
      });
      const factory = new AzureBlobFactory(options);
      const blobName = 'test.error.txt';
      // This assertion expects the error message from _streamToString to be part of the final error.
      await expect(factory.readBlob(blobName)).rejects.toThrow(`readBlob [test.error.txt] Failed: _streamToString Failed: Stream error in readBlob`);
    });
  });
  
  describe('readBlobAsBuffer', () => {
    test('should read content of a blob as buffer', async () => {
        const factory = new AzureBlobFactory(options);
        const blobName = 'test.bin';
        const buffer = await factory.readBlobAsBuffer(blobName);
        expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith(blobName);
        expect(mockBlockBlobClient.download).toHaveBeenCalledTimes(1);
        expect(Buffer.isBuffer(buffer)).toBe(true);
        expect(buffer.toString()).toBe('mock data chunk 1mock data chunk 2');
    });

    test('should throw prefixed error if download fails for readBlobAsBuffer', async () => {
        const downloadError = new Error('Download failed');
        mockBlockBlobClient.download.mockRejectedValue(downloadError);
        const factory = new AzureBlobFactory(options);
        const blobName = 'test.bin';
        await expect(factory.readBlobAsBuffer(blobName)).rejects.toThrow(`readBlobAsBuffer [test.bin] Failed: Download failed`);
    });

    test('should correctly handle stream error for readBlobAsBuffer', async () => {
      const streamError = new Error('Stream error in readBlobAsBuffer');
      mockBlockBlobClient.download.mockResolvedValue({
        readableStreamBody: {
          on: jest.fn((event, callback) => {
            if (event === 'error') { 
              callback(streamError);
            }
            return { on: jest.fn().mockReturnThis() }; 
          }),
          pipe: jest.fn(destination => { 
            return destination;
          })
        }
      });
      const factory = new AzureBlobFactory(options);
      const blobName = 'test.error.bin';
      await expect(factory.readBlobAsBuffer(blobName)).rejects.toThrow(`readBlobAsBuffer [test.error.bin] Failed: Stream error in readBlobAsBuffer`);
    });
  });

  describe('deleteBlob', () => {
    test('should delete a blob if it exists', async () => {
      const factory = new AzureBlobFactory(options);
      const blobName = 'test.txt';
      await factory.deleteBlob(blobName);
      expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith(blobName);
      expect(mockBlockBlobClient.deleteIfExists).toHaveBeenCalledTimes(1);
    });

     test('should throw prefixed error if deleteIfExists fails', async () => {
        const deleteError = new Error('Delete failed');
        mockBlockBlobClient.deleteIfExists.mockRejectedValue(deleteError);
        const factory = new AzureBlobFactory(options);
        const blobName = 'test.txt';
        await expect(factory.deleteBlob(blobName)).rejects.toThrow(`deleteBlob [test.txt] Failed: Delete failed`);
    });
  });

  describe('getBlobUrl', () => {
    test('should return the URL of a blob', () => {
      const factory = new AzureBlobFactory(options);
      const blobName = 'testblob.txt'; 
      const url = factory.getBlobUrl(blobName);
      expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith(blobName);
      expect(url).toBe('https://testaccount.blob.core.windows.net/testcontainer/testblob.txt');
    });
  });
});
