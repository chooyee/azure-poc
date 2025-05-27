const PGP = require('./pgp');
const openpgp = require('openpgp');

// Mock the openpgp module to control its behavior during tests
jest.mock('openpgp', () => ({
  generateKey: jest.fn(),
  readKey: jest.fn(),
  createMessage: jest.fn(),
  encrypt: jest.fn(),
  readMessage: jest.fn(),
  decrypt: jest.fn(),
}));

describe('PGP', () => {
  let pgp;

  beforeEach(() => {
    pgp = new PGP();
    // Reset the mock calls before each test
    openpgp.generateKey.mockReset();
    openpgp.readKey.mockReset();
    openpgp.createMessage.mockReset();
    openpgp.encrypt.mockReset();
    openpgp.readMessage.mockReset();
    openpgp.decrypt.mockReset();
  });

  describe('createCert', () => {
    it('should call openpgp.generateKey with the provided options', async () => {
      const options = {
        userIDs: [{ name: 'Test User', email: 'test@example.com' }],
        passphrase: 'test-passphrase',
        curve: 'ed25519',
      };
      const mockKey = { publicKey: 'mockPublicKey', privateKey: 'mockPrivateKey' };
      openpgp.generateKey.mockResolvedValue(mockKey);

      const result = await pgp.createCert(options);

      expect(openpgp.generateKey).toHaveBeenCalledWith(options);
      expect(result).toEqual(mockKey);
    });

    it('should use ed25519 as the default curve if not provided', async () => {
      const options = {
        userIDs: [{ name: 'Test User', email: 'test@example.com' }],
        passphrase: 'test-passphrase',
      };
      const mockKey = { publicKey: 'mockPublicKey', privateKey: 'mockPrivateKey' };
      openpgp.generateKey.mockResolvedValue(mockKey);

      await pgp.createCert(options);

      expect(openpgp.generateKey).toHaveBeenCalledWith({ ...options, curve: 'ed25519' });
    });

    it('should throw an error if openpgp.generateKey fails', async () => {
      const options = {
        userIDs: [{ name: 'Test User', email: 'test@example.com' }],
        passphrase: 'test-passphrase',
      };
      const errorMessage = 'Key generation error';
      openpgp.generateKey.mockRejectedValue(new Error(errorMessage));

      await expect(pgp.createCert(options)).rejects.toThrow(`Certificate creation failed: ${errorMessage}`);
    });
  });

  describe('encryptBuffer', () => {
    it('should encrypt a buffer with a single armored public key', async () => {
      const inputBuffer = Buffer.from('test data');
      const publicKeyArmored = '-----BEGIN PGP PUBLIC KEY BLOCK-----\n...\n-----END PGP PUBLIC KEY BLOCK-----';
      const mockEncryptionKeys = [{ keyid: 'mockKeyId' }];
      const mockMessage = { toBinary: () => Buffer.from('message binary') };
      const mockEncryptedData = Buffer.from('encrypted data');

      openpgp.readKey.mockResolvedValue(mockEncryptionKeys);
      openpgp.createMessage.mockResolvedValue(mockMessage);
      openpgp.encrypt.mockResolvedValue(mockEncryptedData);

      const result = await pgp.encryptBuffer({ inputBuffer, publicKeys: publicKeyArmored });

      expect(openpgp.readKey).toHaveBeenCalledWith({ armoredKey: publicKeyArmored });
      expect(openpgp.createMessage).toHaveBeenCalledWith({ binary: inputBuffer });
      expect(openpgp.encrypt).toHaveBeenCalledWith({
        message: mockMessage,
        encryptionKeys: mockEncryptionKeys,
        format: 'binary',
      });
      expect(result).toEqual(mockEncryptedData);
    });

    it('should encrypt a buffer with an array of armored public keys', async () => {
      const inputBuffer = Buffer.from('test data');
      const publicKeyArmored1 = '-----BEGIN PGP PUBLIC KEY BLOCK 1-----\n...\n-----END PGP PUBLIC KEY BLOCK 1-----';
      const publicKeyArmored2 = '-----BEGIN PGP PUBLIC KEY BLOCK 2-----\n...\n-----END PGP PUBLIC KEY BLOCK 2-----';
      const mockEncryptionKey1 = [{ keyid: 'mockKeyId1' }];
      const mockEncryptionKey2 = [{ keyid: 'mockKeyId2' }];
      const mockMessage = { toBinary: () => Buffer.from('message binary') };
      const mockEncryptedData = Buffer.from('encrypted data');

      openpgp.readKey.mockResolvedValueOnce(mockEncryptionKey1).mockResolvedValueOnce(mockEncryptionKey2);
      openpgp.createMessage.mockResolvedValue(mockMessage);
      openpgp.encrypt.mockResolvedValue(mockEncryptedData);

      const result = await pgp.encryptBuffer({ inputBuffer, publicKeys: [publicKeyArmored1, publicKeyArmored2] });

      expect(openpgp.readKey).toHaveBeenCalledWith({ armoredKey: publicKeyArmored1 });
      expect(openpgp.readKey).toHaveBeenCalledWith({ armoredKey: publicKeyArmored2 });
      expect(openpgp.createMessage).toHaveBeenCalledWith({ binary: inputBuffer });
      expect(openpgp.encrypt).toHaveBeenCalledWith({
        message: mockMessage,
        encryptionKeys: [mockEncryptionKey1, mockEncryptionKey2],
        format: 'binary',
      });
      expect(result).toEqual(mockEncryptedData);
    });

    it('should encrypt a buffer with an array containing armored and openpgp.Key objects', async () => {
      const inputBuffer = Buffer.from('test data');
      const publicKeyArmored = '-----BEGIN PGP PUBLIC KEY BLOCK-----\n...\n-----END PGP PUBLIC KEY BLOCK-----';
      const mockEncryptionKeyArmored = [{ keyid: 'mockKeyIdArmored' }];
      const mockEncryptionKeyObject = { keyid: 'mockKeyIdObject' };
      const mockMessage = { toBinary: () => Buffer.from('message binary') };
      const mockEncryptedData = Buffer.from('encrypted data');

      openpgp.readKey.mockResolvedValue(mockEncryptionKeyArmored);
      openpgp.createMessage.mockResolvedValue(mockMessage);
      openpgp.encrypt.mockResolvedValue(mockEncryptedData);

      const result = await pgp.encryptBuffer({ inputBuffer, publicKeys: [publicKeyArmored, mockEncryptionKeyObject] });

      expect(openpgp.readKey).toHaveBeenCalledWith({ armoredKey: publicKeyArmored });
      expect(openpgp.createMessage).toHaveBeenCalledWith({ binary: inputBuffer });
      expect(openpgp.encrypt).toHaveBeenCalledWith({
        message: mockMessage,
        encryptionKeys: [mockEncryptionKeyArmored, mockEncryptionKeyObject],
        format: 'binary',
      });
      expect(result).toEqual(mockEncryptedData);
    });

    it('should throw an error if openpgp.readKey fails', async () => {
      const inputBuffer = Buffer.from('test data');
      const publicKeyArmored = 'invalid public key';
      const errorMessage = 'Invalid key format';
      openpgp.readKey.mockRejectedValue(new Error(errorMessage));

      await expect(pgp.encryptBuffer({ inputBuffer, publicKeys: publicKeyArmored }))
        .rejects.toThrow(`Error: PGP:encryptBuffer: Invalid public key format: ${errorMessage}`);
    });

    it('should throw an error if openpgp.createMessage fails', async () => {
      const inputBuffer = Buffer.from('test data');
      const publicKeyArmored = '-----BEGIN PGP PUBLIC KEY BLOCK-----\n...\n-----END PGP PUBLIC KEY BLOCK-----';
      const mockEncryptionKeys = [{ keyid: 'mockKeyId' }];
      const errorMessage = 'Message creation failed';

      openpgp.readKey.mockResolvedValue(mockEncryptionKeys);
      openpgp.createMessage.mockRejectedValue(new Error(errorMessage));

      await expect(pgp.encryptBuffer({ inputBuffer, publicKeys: publicKeyArmored }))
        .rejects.toThrow(`Error:PGP:encryptBuffer: creating message: ${errorMessage}`);
    });

    it('should throw an error if openpgp.encrypt fails', async () => {
      const inputBuffer = Buffer.from('test data');
      const publicKeyArmored = '-----BEGIN PGP PUBLIC KEY BLOCK-----\n...\n-----END PGP PUBLIC KEY BLOCK-----';
      const mockEncryptionKeys = [{ keyid: 'mockKeyId' }];
      const mockMessage = { toBinary: () => Buffer.from('message binary') };
      const errorMessage = 'Encryption failed';

      openpgp.readKey.mockResolvedValue(mockEncryptionKeys);
      openpgp.createMessage.mockResolvedValue(mockMessage);
      openpgp.encrypt.mockRejectedValue(new Error(errorMessage));

      await expect(pgp.encryptBuffer({ inputBuffer, publicKeys: publicKeyArmored }))
        .rejects.toThrow(`Error:PGP:encryptBuffer: during encryption: ${errorMessage}`);
    });
  });

  describe('decryptBuffer', () => {
    it('should decrypt a buffer with an armored private key and passphrase', async () => {
      const inputBuffer = Buffer.from('encrypted data');
      const privateKeyArmored = '-----BEGIN PGP PRIVATE KEY BLOCK-----\n...\n-----END PGP PRIVATE KEY BLOCK-----';
      const passphrase = 'test-passphrase';
      const mockPrivateKeyObject = { decrypt: jest.fn() };
      const mockMessage = { data: Buffer.from('decrypted data') };
      const mockDecrypted = { data: mockMessage.data };

      openpgp.readKey.mockResolvedValue(mockPrivateKeyObject);
      openpgp.readMessage.mockResolvedValue({ binaryMessage: inputBuffer });
      openpgp.decrypt.mockResolvedValue(mockDecrypted);

      const result = await pgp.decryptBuffer({ inputBuffer, privateKey: privateKeyArmored, passphrase });

      expect(openpgp.readKey).toHaveBeenCalledWith({ armoredKey: privateKeyArmored });
      expect(mockPrivateKeyObject.decrypt).toHaveBeenCalledWith(passphrase);
      expect(openpgp.readMessage).toHaveBeenCalledWith({ binaryMessage: inputBuffer });
      expect(openpgp.decrypt).toHaveBeenCalledWith({
        message: { binaryMessage: inputBuffer },
        decryptionKeys: mockPrivateKeyObject,
        format: 'binary',
      });
      expect(result).toEqual(mockDecrypted);
    });

    it('should decrypt a buffer with an armored private key and an empty passphrase', async () => {
      const inputBuffer = Buffer.from('encrypted data');
      const privateKeyArmored = '-----BEGIN PGP PRIVATE KEY BLOCK-----\n...\n-----END PGP PRIVATE KEY BLOCK-----';
      const passphrase = '';
      const mockPrivateKeyObject = { decrypt: jest.fn() };
      const mockMessage = { data: Buffer.from('decrypted data') };
      const mockDecrypted = { data: mockMessage.data };

      openpgp.readKey.mockResolvedValue(mockPrivateKeyObject);
      openpgp.readMessage.mockResolvedValue({ binaryMessage: inputBuffer });
      openpgp.decrypt.mockResolvedValue(mockDecrypted);

      const result = await pgp.decryptBuffer({ inputBuffer, privateKey: privateKeyArmored, passphrase });

      expect(openpgp.readKey).toHaveBeenCalledWith({ armoredKey: privateKeyArmored });
      expect(mockPrivateKeyObject.decrypt).not.toHaveBeenCalled();
      expect(openpgp.readMessage).toHaveBeenCalledWith({ binaryMessage: inputBuffer });
      expect(openpgp.decrypt).toHaveBeenCalledWith({
        message: { binaryMessage: inputBuffer },
        decryptionKeys: mockPrivateKeyObject,
        format: 'binary',
      });
      expect(result).toEqual(mockDecrypted);
    });

    it('should throw an error if openpgp.readKey fails during private key decryption', async () => {
      const inputBuffer = Buffer.from('encrypted data');
      const privateKeyArmored = 'invalid private key';
      const passphrase = 'test-passphrase';
      const errorMessage = 'Invalid private key format';
      openpgp.readKey.mockRejectedValue(new Error(errorMessage));

      await expect(pgp.decryptBuffer({ inputBuffer, privateKey: privateKeyArmored, passphrase }))
        .rejects.toThrow(`Error: PGP:decryptBuffer: decrypting private key: ${errorMessage}`);
    });

    it('should throw an error if openpgp.readMessage fails', async () => {
      const inputBuffer = Buffer.from('encrypted data');
      const privateKeyArmored = '-----BEGIN PGP PRIVATE KEY BLOCK-----\n...\n-----END PGP PRIVATE KEY BLOCK-----';
      const passphrase = 'test-passphrase';
      const mockPrivateKeyObject = { decrypt: jest.fn() };
      const errorMessage = 'Reading message failed';

      openpgp.readKey.mockResolvedValue(mockPrivateKeyObject);
      openpgp.readMessage.mockRejectedValue(new Error(errorMessage));

      await expect(pgp.decryptBuffer({ inputBuffer, privateKey: privateKeyArmored, passphrase }))
        .rejects.toThrow(`Error: PGP:decryptBuffer: reading message: ${errorMessage}`);
    });

    it('should throw an error if openpgp.decrypt fails', async () => {
      const inputBuffer = Buffer.from('encrypted data');
      const privateKeyArmored = '-----BEGIN PGP PRIVATE KEY BLOCK-----\n...\n-----END PGP PRIVATE KEY BLOCK-----';
      const passphrase = 'test-passphrase';
      const mockPrivateKeyObject = { decrypt: jest.fn() };
      const mockMessage = { data: Buffer.from('encrypted data') };
      const errorMessage = 'Decryption failed';

      openpgp.readKey.mockResolvedValue(mockPrivateKeyObject);
      openpgp.readMessage.mockResolvedValue({ binaryMessage: inputBuffer });
      openpgp.decrypt.mockRejectedValue(new Error(errorMessage));

      await expect(pgp.decryptBuffer({ inputBuffer, privateKey: privateKeyArmored, passphrase }))
        .rejects.toThrow(`Error: PGP:decryptBuffer: during decryption: ${errorMessage}`);
    });
  });
});