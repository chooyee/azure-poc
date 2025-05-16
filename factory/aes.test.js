const aes = require('../path/to/aes'); // Adjust the path as necessary

describe('AES Functionality', () => {
    it('should encrypt and decrypt correctly', () => {
        const key = '1234567890123456';
        const plaintext = 'Hello, World!';
        const ciphertext = aes.encrypt(key, plaintext);
        const decrypted = aes.decrypt(key, ciphertext);
        expect(decrypted).toBe(plaintext);
    });

    it('should throw an error for invalid key length', () => {
        const key = 'shortkey';
        const plaintext = 'Hello, World!';
        expect(() => aes.encrypt(key, plaintext)).toThrow('Invalid key length');
    });
});