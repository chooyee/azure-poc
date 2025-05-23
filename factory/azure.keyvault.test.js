const AzureKeyFactory = require('./azure.keyvault.js'); // Adjust path if necessary
const { KeyClient, CryptographyClient } = require('@azure/keyvault-keys');
const { DefaultAzureCredential } = require('@azure/identity');
const crypto = require('crypto'); // For generating test data if needed

// Mock the Azure SDK modules
jest.mock('@azure/identity');
jest.mock('@azure/keyvault-keys');

describe('AzureKeyFactory', () => {
  const OLD_ENV = process.env; // To restore original process.env after tests
  const mockVaultUrl = 'https://testvault.vault.azure.net';

  // Mock instances and methods
  let mockKeyClientInstance;
  let mockCryptographyClientInstance;
  let mockDefaultAzureCredentialInstance;

  beforeEach(() => {
    jest.resetAllMocks(); // Reset mocks
    process.env = { ...OLD_ENV, AZURE_KEY_VAULT_URL: mockVaultUrl }; // Set mock env var

    mockDefaultAzureCredentialInstance = {}; // Mock credential object
    DefaultAzureCredential.mockImplementation(() => mockDefaultAzureCredentialInstance);

    // Mock KeyClient methods
    mockKeyClientInstance = {
      listPropertiesOfKeys: jest.fn().mockImplementation(async function*() {
        yield { name: 'key1' };
        yield { name: 'key2' };
      }),
      // Corrected mock to include key.kid structure, as expected by azure.keyvault.js
      getKey: jest.fn().mockResolvedValue({ name: 'test-key', id: 'test-key-id', key: { kid: 'test-key-id' } })
    };
    KeyClient.mockImplementation(() => mockKeyClientInstance);

    // Mock CryptographyClient methods
    mockCryptographyClientInstance = {
      encrypt: jest.fn().mockResolvedValue({ result: Buffer.from('encrypted_symmetric_key_data') }),
      decrypt: jest.fn().mockResolvedValue({ result: Buffer.from('decrypted_symmetric_key_data') })
    };
    CryptographyClient.mockImplementation(() => mockCryptographyClientInstance);
  });

  afterAll(() => {
    process.env = OLD_ENV; // Restore original environment
  });

  // Test Suite for List method
  describe('List', () => {
    test('should list all key names from Key Vault', async () => {
      const keys = await AzureKeyFactory.List();
      expect(KeyClient).toHaveBeenCalledWith(mockVaultUrl, mockDefaultAzureCredentialInstance);
      expect(mockKeyClientInstance.listPropertiesOfKeys).toHaveBeenCalledTimes(1);
      expect(keys).toEqual(['key1', 'key2']);
    });

    test('should throw error if AZURE_KEY_VAULT_URL is not set', async () => {
      delete process.env.AZURE_KEY_VAULT_URL;
      try {
        await AzureKeyFactory.List();
        expect(true).toBe(false); // Should not reach here
      } catch (e) {
        expect(e.message).toBe('AZURE_KEY_VAULT_URL is not set');
      }
    });
    
    test('should re-throw error from KeyClient on failure', async () => {
      const listError = new Error('KeyVault List Error');
      mockKeyClientInstance.listPropertiesOfKeys.mockImplementation(async function*() {
        throw listError;
      });
      await expect(AzureKeyFactory.List()).rejects.toThrow(listError);
    });
  });

  // Test Suite for EncryptFile method
  describe('EncryptFile', () => {
    const keyName = 'my-encryption-key';
    const fileBuffer = Buffer.from('This is a test file content.');

    test('should encrypt file buffer and symmetric key successfully', async () => {
      const result = await AzureKeyFactory.EncryptFile(keyName, fileBuffer);

      expect(KeyClient).toHaveBeenCalledWith(mockVaultUrl, mockDefaultAzureCredentialInstance);
      expect(mockKeyClientInstance.getKey).toHaveBeenCalledWith(keyName);
      // Corrected: CryptographyClient should be called with keyBundle.key.kid
      expect(CryptographyClient).toHaveBeenCalledWith('test-key-id', mockDefaultAzureCredentialInstance);
      expect(mockCryptographyClientInstance.encrypt).toHaveBeenCalledWith("RSA-OAEP", expect.any(Buffer)); 

      expect(result.encryptedSymmetricKey).toBe(Buffer.from('encrypted_symmetric_key_data').toString('base64'));
      expect(result.iv).toBeDefined();
      expect(result.encryptedFile).toBeDefined();
    });
    
    test('should throw error if AZURE_KEY_VAULT_URL is not set for EncryptFile', async () => {
        delete process.env.AZURE_KEY_VAULT_URL;
        try {
            await AzureKeyFactory.EncryptFile(keyName, fileBuffer);
            expect(true).toBe(false); 
        } catch (e) {
            expect(e.message).toBe('AZURE_KEY_VAULT_URL is not set');
        }
    });

    test('should re-throw error from CryptographyClient encrypt on failure', async () => {
      const encryptError = new Error('KeyVault Encrypt Error');
      mockCryptographyClientInstance.encrypt.mockRejectedValue(encryptError);
      await expect(AzureKeyFactory.EncryptFile(keyName, fileBuffer)).rejects.toThrow(encryptError);
    });

    test('should throw error if getKey fails in EncryptFile', async () => {
      const getKeyError = new Error('GetKey failed');
      mockKeyClientInstance.getKey.mockRejectedValue(getKeyError);
      await expect(AzureKeyFactory.EncryptFile(keyName, fileBuffer)).rejects.toThrow(getKeyError);
    });
  });

  // Test Suite for DecryptFile method
  describe('DecryptFile', () => {
    const keyName = 'my-decryption-key';
    const encryptedSymmetricKeyB64 = Buffer.from('encrypted_symmetric_key_data').toString('base64');
    const iv = crypto.randomBytes(16); 
    const symmetricKeyForDecryptionTest = crypto.randomBytes(32); 
    
    let encryptedFileBuffer;
    const originalFileContent = "Decrypted test content";

    beforeEach(() => {
        mockCryptographyClientInstance.decrypt.mockResolvedValue({ result: symmetricKeyForDecryptionTest });

        const cipher = crypto.createCipheriv("aes-256-cbc", symmetricKeyForDecryptionTest, iv);
        const encryptedFilePart = cipher.update(Buffer.from(originalFileContent));
        const encryptedFileFinal = cipher.final();
        encryptedFileBuffer = Buffer.concat([encryptedFilePart, encryptedFileFinal]);
    });

    test('should decrypt symmetric key and file buffer successfully', async () => {
      const decryptedBuffer = await AzureKeyFactory.DecryptFile(keyName, encryptedSymmetricKeyB64, iv.toString('base64'), encryptedFileBuffer);

      expect(KeyClient).toHaveBeenCalledWith(mockVaultUrl, mockDefaultAzureCredentialInstance);
      expect(mockKeyClientInstance.getKey).toHaveBeenCalledWith(keyName);
      // Corrected: CryptographyClient should be called with keyBundle.key.kid
      expect(CryptographyClient).toHaveBeenCalledWith('test-key-id', mockDefaultAzureCredentialInstance);
      expect(mockCryptographyClientInstance.decrypt).toHaveBeenCalledWith("RSA-OAEP", Buffer.from(encryptedSymmetricKeyB64, 'base64'));
      
      expect(Buffer.isBuffer(decryptedBuffer)).toBe(true);
      expect(decryptedBuffer.toString('utf8')).toBe(originalFileContent); 
    });

    test('should throw error if AZURE_KEY_VAULT_URL is not set for DecryptFile', async () => {
        delete process.env.AZURE_KEY_VAULT_URL;
        try {
            await AzureKeyFactory.DecryptFile(keyName, encryptedSymmetricKeyB64, iv.toString('base64'), encryptedFileBuffer);
            expect(true).toBe(false);
        } catch (e) {
            expect(e.message).toBe('AZURE_KEY_VAULT_URL is not set');
        }
    });
    
    test('should re-throw error from CryptographyClient decrypt on failure', async () => {
      const decryptError = new Error('KeyVault Decrypt Error');
      mockCryptographyClientInstance.decrypt.mockRejectedValue(decryptError);
      await expect(AzureKeyFactory.DecryptFile(keyName, encryptedSymmetricKeyB64, iv.toString('base64'), encryptedFileBuffer)).rejects.toThrow(decryptError);
    });

    test('should throw error if getKey fails in DecryptFile', async () => {
      const getKeyError = new Error('GetKey failed');
      mockKeyClientInstance.getKey.mockRejectedValue(getKeyError);
      await expect(AzureKeyFactory.DecryptFile(keyName, encryptedSymmetricKeyB64, iv.toString('base64'), encryptedFileBuffer)).rejects.toThrow(getKeyError);
    });

    test('should throw error if IV is invalid for decryption', async () => {
        const invalidIv = "not_a_base64_iv_or_wrong_length"; 
        // Corrected regex to be simpler or exact match
        await expect(AzureKeyFactory.DecryptFile(keyName, encryptedSymmetricKeyB64, invalidIv, encryptedFileBuffer))
          .rejects.toThrow(/Invalid IV/i); 
    });
  });
});
