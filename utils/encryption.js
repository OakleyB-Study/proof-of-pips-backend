// backend/utils/encryption.js
// Utility functions for encrypting/decrypting API keys

const crypto = require('crypto');

// IMPORTANT: Add this to your Railway environment variables
// Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-32-byte-hex-key-here'; // Must be 32 bytes (64 hex chars)
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypts a plaintext API key
 * @param {string} text - The API key to encrypt
 * @returns {string} - Encrypted string in format: iv:authTag:encryptedData
 */
function encrypt(text) {
  if (!text) return null;
  
  // Convert hex key to buffer
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  
  // Generate random IV (initialization vector)
  const iv = crypto.randomBytes(16);
  
  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  // Encrypt the text
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Get auth tag for GCM mode
  const authTag = cipher.getAuthTag();
  
  // Return: iv:authTag:encryptedData
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an encrypted API key
 * @param {string} encryptedText - The encrypted string (iv:authTag:encryptedData)
 * @returns {string} - Decrypted API key
 */
function decrypt(encryptedText) {
  if (!encryptedText) return null;
  
  // Split the encrypted string
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }
  
  const [ivHex, authTagHex, encrypted] = parts;
  
  // Convert hex key to buffer
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  
  // Convert IV and authTag from hex
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  // Decrypt the text
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted.trim(); // Remove any whitespace/newlines
}

module.exports = { encrypt, decrypt };
