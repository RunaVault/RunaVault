import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { promisify } from "util";

const { USER_POOL_ID, AWS_REGION } = process.env;

const client = jwksClient({
  jwksUri: `https://cognito-idp.${AWS_REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`,
});

const getSigningKey = promisify(client.getSigningKey.bind(client));

export async function verifyToken(token) {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded?.header?.kid) throw new Error("Invalid token: Missing key ID");
  const key = await getSigningKey(decoded.header.kid);
  return jwt.verify(token, key.getPublicKey(), { algorithms: ["RS256"] });
}

export function formatResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      ...headers,
    },
  };
}

export function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\\/g, '&#92;')
    .replace(/`/g, '&#96;');
}

export function sanitizeObject(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function parseBody(body) {
  if (!body) throw new Error("No body provided");
  try {
    const parsedBody = JSON.parse(body);
    return sanitizeObject(parsedBody);
  } catch {
    throw new Error("Body is not valid JSON");
  }
}

export function getAuthToken(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Unauthorized: No token provided");
  }
  return authHeader.split(" ")[1];
}