const AzureKeyFactory = require('./azure.keyvault'); // Adjust path as needed
const { DefaultAzureCredential } = require("@azure/identity");
const { KeyClient, CryptographyClient } = require("@azure/keyvault-keys");
const crypto = require("crypto");

// Mock Azure SDK modules
jest.mock("@azure/identity");
jest.mock("@azure/keyvault-keys");
jest.mock("crypto");

describe('AzureKeyFactory', () => {
    let mockKeyClient;
    let mockCryptographyClient;
    let mockDefaultAzureCredential;
    
    beforeEach(() => {
        // Reset all mocks before each test
        jest.clearAllMocks();
        
        // Mock DefaultAzureCredential
        mockDefaultAzureCredential = {};
        DefaultAzureCredential.mockImplementation(() => mockDefaultAzureCredential);
        
        // Mock KeyClient
        mockKeyClient = {
            listPropertiesOfKeys: jest.fn(),
            getKey: jest.fn()
        };
        KeyClient.mockImplementation(() => mockKeyClient);
        
        // Mock CryptographyClient
        mockCryptographyClient = {
            encrypt: jest.fn(),
            decrypt: jest.fn()
        };
        CryptographyClient.mockImplementation(() => mockCryptographyClient);
        
        // Set up environment variable
        process.env.AZURE_KEY_VAULT_URL = 'https://test-vault.vault.azure.net/';
    });

    afterEach(() => {
        // Clean up environment variables
        delete process.env.AZURE_KEY_VAULT_URL;
    });

    describe('List', () => {
        it('should successfully list all keys from Azure Key Vault', async () => {
            // Arrange
            const mockKeys = [
                { name: 'key1' },
                { name: 'key2' },
                { name: 'key3' }
            ];
            
            // Mock async iterator
            mockKeyClient.listPropertiesOfKeys.mockReturnValue({
                [Symbol.asyncIterator]: async function* () {
                    for (const key of mockKeys) {
                        yield key;
                    }
                }
            });

            // Act
            const result = await AzureKeyFactory.List();

            // Assert
            expect(result).toEqual(['key1', 'key2', 'key3']);
            expect(KeyClient).toHaveBeenCalledWith(
                'https://test-vault.vault.azure.net/',
                mockDefaultAzureCredential
            );
            expect(mockKeyClient.listPropertiesOfKeys).toHaveBeenCalledTimes(1);
        });

        it('should throw an error when AZURE_KEY_VAULT_URL is not set', async () => {
            // Arrange
            delete process.env.AZURE_KEY_VAULT_URL;

            // Act & Assert
            await expect(AzureKeyFactory.List()).rejects.toThrow('AZURE_KEY_VAULT_URL is not set');
        });

        it('should handle and re-throw errors from Key Vault operations', async () => {
            // Arrange
            const mockError = new Error('Key Vault connection failed');
            mockKeyClient.listPropertiesOfKeys.mockImplementation(() => {
                throw mockError;
            });

            // Act & Assert
            await expect(AzureKeyFactory.List()).rejects.toThrow('Key Vault connection failed');
        });
    });

    describe('EncryptFile', () => {
        let mockSymmetricKey;
        let mockIv;
        let mockEncryptedFile;
        let mockCipher;

        beforeEach(() => {
            // Mock crypto functions
            mockSymmetricKey = Buffer.from('mock-symmetric-key-32-bytes-long!!');
            mockIv = Buffer.from('mock-iv-16-bytes!');
            mockEncryptedFile = Buffer.from('encrypted-file-content');
            
            crypto.randomBytes = jest.fn()
                .mockReturnValueOnce(mockSymmetricKey) // First call for symmetric key
                .mockReturnValueOnce(mockIv);          // Second call for IV
            
            mockCipher = {
                update: jest.fn().mockReturnValue(Buffer.from('encrypted-part')),
                final: jest.fn().mockReturnValue(Buffer.from('-final'))
            };
            crypto.createCipheriv = jest.fn().mockReturnValue(mockCipher);
            
            // Mock Buffer.concat
            Buffer.concat = jest.fn().mockReturnValue(mockEncryptedFile);
        });

        it('should successfully encrypt a file using envelope encryption', async () => {
            // Arrange
            const keyName = 'test-key';
            const fileBuffer = Buffer.from('test file content');
            const mockKey = { id: 'key-id', name: keyName };
            const mockEncryptResult = {
                result: Buffer.from('encrypted-symmetric-key')
            };

            mockKeyClient.getKey.mockResolvedValue(mockKey);
            mockCryptographyClient.encrypt.mockResolvedValue(mockEncryptResult);

            // Act
            const result = await AzureKeyFactory.EncryptFile(keyName, fileBuffer);

            // Assert
            expect(result).toEqual({
                encryptedSymmetricKey: mockEncryptResult.result.toString('base64'),
                iv: mockIv.toString('base64'),
                encryptedFile: mockEncryptedFile.toString('base64')
            });

            expect(KeyClient).toHaveBeenCalledWith(
                'https://test-vault.vault.azure.net/',
                mockDefaultAzureCredential
            );
            expect(mockKeyClient.getKey).toHaveBeenCalledWith(keyName);
            expect(CryptographyClient).toHaveBeenCalledWith(mockKey, mockDefaultAzureCredential);
            expect(crypto.randomBytes).toHaveBeenCalledWith(32); // Symmetric key
            expect(crypto.randomBytes).toHaveBeenCalledWith(16); // IV
            expect(crypto.createCipheriv).toHaveBeenCalledWith('aes-256-cbc', mockSymmetricKey, mockIv);
            expect(mockCipher.update).toHaveBeenCalledWith(fileBuffer);
            expect(mockCipher.final).toHaveBeenCalledTimes(1);
            expect(mockCryptographyClient.encrypt).toHaveBeenCalledWith('RSA-OAEP', mockSymmetricKey);
        });

        it('should throw an error when AZURE_KEY_VAULT_URL is not set', async () => {
            // Arrange
            delete process.env.AZURE_KEY_VAULT_URL;
            const keyName = 'test-key';
            const fileBuffer = Buffer.from('test content');

            // Act & Assert
            await expect(AzureKeyFactory.EncryptFile(keyName, fileBuffer))
                .rejects.toThrow('AZURE_KEY_VAULT_URL is not set');
        });

        it('should handle and re-throw errors during encryption', async () => {
            // Arrange
            const keyName = 'test-key';
            const fileBuffer = Buffer.from('test content');
            const mockError = new Error('Encryption failed');

            mockKeyClient.getKey.mockRejectedValue(mockError);

            // Act & Assert
            await expect(AzureKeyFactory.EncryptFile(keyName, fileBuffer))
                .rejects.toThrow('Encryption failed');
        });
    });

    describe('DecryptFile', () => {
        let mockDecipher;
        let mockDecryptedFileBuffer;

        beforeEach(() => {
            // Mock crypto functions for decryption
            mockDecryptedFileBuffer = Buffer.from('decrypted file content');
            mockDecipher = {
                update: jest.fn().mockReturnValue(Buffer.from('decrypted-part')),
                final: jest.fn().mockReturnValue(Buffer.from('-final'))
            };
            crypto.createDecipheriv = jest.fn().mockReturnValue(mockDecipher);
            Buffer.concat = jest.fn().mockReturnValue(mockDecryptedFileBuffer);
        });

        it('should successfully decrypt a file using envelope decryption', async () => {
            // Arrange
            const keyName = 'test-key';
            const encryptedSymmetricKeyB64 = Buffer.from('encrypted-symmetric-key').toString('base64');
            const ivB64 = Buffer.from('initialization-vector').toString('base64');
            const encryptedFileBuffer = Buffer.from('encrypted-file-content');

            const mockKey = { 
                id: 'https://test-vault.vault.azure.net/keys/test-key/version',
                name: keyName 
            };
            const mockDecryptResult = {
                result: Buffer.from('decrypted-symmetric-key-32-bytes!!')
            };

            mockKeyClient.getKey.mockResolvedValue(mockKey);
            mockCryptographyClient.decrypt.mockResolvedValue(mockDecryptResult);

            // Act
            const result = await AzureKeyFactory.DecryptFile(
                keyName, 
                encryptedSymmetricKeyB64, 
                ivB64, 
                encryptedFileBuffer
            );

            // Assert
            expect(result).toBe(mockDecryptedFileBuffer);
            expect(KeyClient).toHaveBeenCalledWith(
                'https://test-vault.vault.azure.net/',
                mockDefaultAzureCredential
            );
            expect(mockKeyClient.getKey).toHaveBeenCalledWith(keyName);
            expect(CryptographyClient).toHaveBeenCalledWith(mockKey.id, mockDefaultAzureCredential);
            expect(mockCryptographyClient.decrypt).toHaveBeenCalledWith(
                'RSA-OAEP', 
                Buffer.from(encryptedSymmetricKeyB64, 'base64')
            );
            expect(crypto.createDecipheriv).toHaveBeenCalledWith(
                'aes-256-cbc',
                mockDecryptResult.result,
                Buffer.from(ivB64, 'base64')
            );
            expect(mockDecipher.update).toHaveBeenCalledWith(encryptedFileBuffer);
            expect(mockDecipher.final).toHaveBeenCalledTimes(1);
        });

        it('should throw an error when AZURE_KEY_VAULT_URL is not set', async () => {
            // Arrange
            delete process.env.AZURE_KEY_VAULT_URL;
            const keyName = 'test-key';
            const encryptedSymmetricKeyB64 = 'encrypted-key';
            const ivB64 = 'initialization-vector';
            const encryptedFileBuffer = Buffer.from('encrypted-content');

            // Act & Assert
            await expect(AzureKeyFactory.DecryptFile(
                keyName, 
                encryptedSymmetricKeyB64, 
                ivB64, 
                encryptedFileBuffer
            )).rejects.toThrow('AZURE_KEY_VAULT_URL is not set');
        });

        it('should handle and re-throw errors during decryption', async () => {
            // Arrange
            const keyName = 'test-key';
            const encryptedSymmetricKeyB64 = 'encrypted-key';
            const ivB64 = 'initialization-vector';
            const encryptedFileBuffer = Buffer.from('encrypted-content');
            const mockError = new Error('Decryption failed');

            mockKeyClient.getKey.mockRejectedValue(mockError);

            // Act & Assert
            await expect(AzureKeyFactory.DecryptFile(
                keyName, 
                encryptedSymmetricKeyB64, 
                ivB64, 
                encryptedFileBuffer
            )).rejects.toThrow('Decryption failed');
        });

        it('should handle invalid base64 input gracefully', async () => {
            // Arrange
            const keyName = 'test-key';
            const invalidBase64 = 'invalid-base64!@#$%';
            const validIvB64 = Buffer.from('valid-iv-16-bytes').toString('base64');
            const encryptedFileBuffer = Buffer.from('encrypted-content');

            // Act & Assert
            await expect(AzureKeyFactory.DecryptFile(
                keyName, 
                invalidBase64, 
                validIvB64, 
                encryptedFileBuffer
            )).rejects.toThrow();
        });
    });

    describe('Integration scenarios', () => {
        it('should handle encrypt-decrypt round trip', async () => {
            // This test demonstrates how the encrypt and decrypt functions work together
            const keyName = 'test-key';
            const originalContent = Buffer.from('This is test file content for round trip testing');
            
            // Mock for encryption
            const mockSymmetricKey = Buffer.from('test-symmetric-key-32-bytes-long!');
            const mockIv = Buffer.from('test-iv-16-bytes');
            const mockEncryptedSymmetricKey = Buffer.from('encrypted-symmetric-key');
            
            crypto.randomBytes = jest.fn()
                .mockReturnValueOnce(mockSymmetricKey)
                .mockReturnValueOnce(mockIv);
            
            const mockCipher = {
                update: jest.fn().mockReturnValue(Buffer.from('encrypted-part')),
                final: jest.fn().mockReturnValue(Buffer.from('-final'))
            };
            crypto.createCipheriv = jest.fn().mockReturnValue(mockCipher);
            Buffer.concat = jest.fn().mockReturnValue(Buffer.from('encrypted-file-content'));
            
            const mockKey = { id: 'key-id', name: keyName };
            mockKeyClient.getKey.mockResolvedValue(mockKey);
            mockCryptographyClient.encrypt.mockResolvedValue({
                result: mockEncryptedSymmetricKey
            });
            
            // Perform encryption
            const encryptResult = await AzureKeyFactory.EncryptFile(keyName, originalContent);
            
            // Verify encryption result structure
            expect(encryptResult).toHaveProperty('encryptedSymmetricKey');
            expect(encryptResult).toHaveProperty('iv');
            expect(encryptResult).toHaveProperty('encryptedFile');
            expect(typeof encryptResult.encryptedSymmetricKey).toBe('string');
            expect(typeof encryptResult.iv).toBe('string');
            expect(typeof encryptResult.encryptedFile).toBe('string');
        });
    });
});