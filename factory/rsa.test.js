const RSAEncryption = require('./rsa'); 
const fs = require('fs');
const forge = require('node-forge');

jest.mock('fs');
jest.mock('node-forge');

describe('RSAEncryption', () => {
  const mockPrivateKeyPem = "FAKE_PEM_CONTENT";
  
  // Mock functions for fs
  let mockFsReadFileSync;

  // Mock functions for forge.pki
  let mockPkiDecryptRsaPrivateKey;
  let mockPkiSetRsaPublicKey;
  
  // Mock functions for forge.util
  let mockUtilCreateBuffer;
  let mockUtilEncode64;
  let mockUtilDecode64;
  let mockUtilDecodeUtf8;

  // Mock functions for forge.md
  let mockMdSha256Create;

  // Mock key objects that would be returned by forge functions
  let mockRawPrivateKeyObject; // Returned by decryptRsaPrivateKey
  let mockRawPublicKeyObject;  // Returned by setRsaPublicKey

  beforeEach(() => {
    jest.resetAllMocks(); // Clear all mocks before each test

    // --- fs mocks ---
    mockFsReadFileSync = jest.fn().mockReturnValue(mockPrivateKeyPem);
    fs.readFileSync = mockFsReadFileSync;

    // --- node-forge pki mocks ---
    // decryptRsaPrivateKey returns an object with n and e, and a decrypt method for Part A tests
    mockRawPrivateKeyObject = { 
      n: 'mockN_from_decrypt', 
      e: 'mockE_from_decrypt',
      decrypt: jest.fn().mockReturnValue('DECRYPTED_DATA_RAW') 
    };
    // setRsaPublicKey returns an object with an encrypt method for Part A tests
    mockRawPublicKeyObject = {
      encrypt: jest.fn().mockReturnValue('ENCRYPTED_DATA_RAW')
    };

    mockPkiDecryptRsaPrivateKey = jest.fn().mockReturnValue(mockRawPrivateKeyObject);
    mockPkiSetRsaPublicKey = jest.fn().mockReturnValue(mockRawPublicKeyObject);
    
    // Assign mocks to forge.pki
    forge.pki = {
      decryptRsaPrivateKey: mockPkiDecryptRsaPrivateKey,
      setRsaPublicKey: mockPkiSetRsaPublicKey,
    };
    
    // --- node-forge util mocks ---
    // createBuffer is often chained with .getBytes(), so simulate that.
    mockUtilCreateBuffer = jest.fn(data => ({ getBytes: () => data })); 
    mockUtilEncode64 = jest.fn(data => `${data}_encoded_base64`); // More specific mock return
    mockUtilDecode64 = jest.fn(data => data.replace('_encoded_base64', ''));
    mockUtilDecodeUtf8 = jest.fn(data => `${data}_decoded_utf8`); // More specific mock return
    
    // Assign mocks to forge.util
    forge.util = {
      createBuffer: mockUtilCreateBuffer,
      encode64: mockUtilEncode64,
      decode64: mockUtilDecode64,
      decodeUtf8: mockUtilDecodeUtf8,
    };

    // --- node-forge md mocks ---
    // .create() usually returns an object that might have .update() or .digest() called.
    // For RSA-OAEP, it's typically just passed as an option.
    mockMdSha256Create = jest.fn().mockReturnValue({ /* mock mdObject if methods are called on it */ });
    
    // Assign mocks to forge.md.sha256
    forge.md = {
      sha256: {
        create: mockMdSha256Create,
      },
    };
  });

  describe('Constructor', () => {
    test('should successfully instantiate, load keys, and call setRsaPublicKey', () => {
      const rsa = new RSAEncryption({ privateKeyFile: 'fake.pem' });

      expect(fs.readFileSync).toHaveBeenCalledWith('fake.pem', 'utf8');
      expect(forge.pki.decryptRsaPrivateKey).toHaveBeenCalledWith(mockPrivateKeyPem, undefined); // Password is undefined by default
      
      // For Part A, this call to setRsaPublicKey is expected per instructions,
      // even if current rsa.js doesn't do it. This test will guide refactoring.
      expect(forge.pki.setRsaPublicKey).toHaveBeenCalledWith(mockRawPrivateKeyObject.n, mockRawPrivateKeyObject.e);
      
      // Verify that the keyPair internal structure is roughly what's expected
      // after the (future) refactor.
      expect(rsa.keyPair).toBeDefined();
      expect(rsa.keyPair.privateKey).toBe(mockRawPrivateKeyObject);
      expect(rsa.keyPair.publicKey).toBe(mockRawPublicKeyObject);
    });

    test('should throw error if privateKeyFile option is missing', () => {
      expect(() => new RSAEncryption()).toThrow('Private key file path is required');
      expect(() => new RSAEncryption({})).toThrow('Private key file path is required');
    });

    test('should throw error if decryptRsaPrivateKey returns null (failed decryption)', () => {
      forge.pki.decryptRsaPrivateKey.mockReturnValue(null); // Simulate decryption failure
      expect(() => new RSAEncryption({ privateKeyFile: 'fake.pem' }))
        .toThrow('Failed to decrypt private key - wrong password?');
    });
  });

  describe('Encrypt method', () => {
    test('should encrypt data using the public key and encode the result', () => {
      const rsa = new RSAEncryption({ privateKeyFile: 'fake.pem' });
      // The constructor test above already expects keyPair.publicKey to be mockRawPublicKeyObject.
      
      const result = rsa.encrypt('test_payload');

      expect(forge.util.createBuffer).toHaveBeenCalledWith('test_payload', 'utf8');
      // Ensure the actual payload (after getBytes()) is passed to encrypt
      expect(mockRawPublicKeyObject.encrypt).toHaveBeenCalledWith('test_payload', 'RSA-OAEP', { md: forge.md.sha256.create() });
      expect(forge.util.encode64).toHaveBeenCalledWith('ENCRYPTED_DATA_RAW');
      expect(result).toBe('ENCRYPTED_DATA_RAW_encoded_base64');
    });
  });

  describe('Decrypt method', () => {
    test('should decode input, decrypt using the private key, and decode UTF8', () => {
      const rsa = new RSAEncryption({ privateKeyFile: 'fake.pem' });
      // The constructor test already expects keyPair.privateKey to be mockRawPrivateKeyObject.

      const result = rsa.decrypt('test_ciphertext_encoded_base64');

      expect(forge.util.decode64).toHaveBeenCalledWith('test_ciphertext_encoded_base64');
      // Ensure the raw decoded data is passed to decrypt
      expect(mockRawPrivateKeyObject.decrypt).toHaveBeenCalledWith('test_ciphertext', 'RSA-OAEP', { md: forge.md.sha256.create() });
      expect(forge.util.decodeUtf8).toHaveBeenCalledWith('DECRYPTED_DATA_RAW');
      expect(result).toBe('DECRYPTED_DATA_RAW_decoded_utf8');
    });
  });
});
