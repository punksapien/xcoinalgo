// Simple working crypto functions for demo
export function encrypt(text: string): string {
  return Buffer.from(text).toString('base64');
}

export function decrypt(encryptedData: string): string {
  return Buffer.from(encryptedData, 'base64').toString('utf8');
}