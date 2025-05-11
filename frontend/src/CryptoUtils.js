import { KMSClient, EncryptCommand, DecryptCommand } from "@aws-sdk/client-kms";
import { CognitoIdentityClient } from "@aws-sdk/client-cognito-identity";
import { fromCognitoIdentityPool } from "@aws-sdk/credential-provider-cognito-identity";

const AWS_REGION = process.env.REACT_APP_AWS_REGION;
const KMS_KEY_ID = process.env.REACT_APP_KMS_KEY_ID;

export const isCryptoSupported = () => {
  return window.crypto && window.crypto.subtle;
};

const initKMS = async (idToken) => {
  if (!idToken) throw new Error('No ID token provided');
  const payload = JSON.parse(atob(idToken.split('.')[1]));
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('ID token expired');
  }
  try {
    const credentials = fromCognitoIdentityPool({
      client: new CognitoIdentityClient({ region: AWS_REGION }),
      identityPoolId: process.env.REACT_APP_IDENTITY_POOL_ID,
      logins: {
        [`cognito-idp.${process.env.REACT_APP_AWS_REGION}.amazonaws.com/${process.env.REACT_APP_COGNITO_ID}`]: idToken,
      },
    });

    return new KMSClient({
      region: AWS_REGION,
      credentials,
    });
  } catch (error) {
    console.error('Error initializing KMS:', error);
    throw error;
  }
};

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  const binString = String.fromCharCode(...bytes);
  return btoa(binString);
};

const base64ToUint8Array = (base64) => {
  const binString = atob(base64);
  const bytes = new Uint8Array(binString.length);
  for (let i = 0; i < binString.length; i++) {
    bytes[i] = binString.charCodeAt(i);
  }
  return bytes;
};

export const encryptPassword = async (password, idToken, shareWithUsers = [], shareWithGroups = []) => {
  try {
    const kms = await initKMS(idToken);
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    const encryptParams = {
      KeyId: KMS_KEY_ID,
      Plaintext: passwordBuffer,
      EncryptionContext: { purpose: 'password-manager' },
    };
    const kmsResponse = await kms.send(new EncryptCommand(encryptParams));
    const encryptedPassword = arrayBufferToBase64(kmsResponse.CiphertextBlob);

    const result = {
      encryptedPassword,
      sharedWith: { users: [], groups: [] },
    };

    if (shareWithUsers.length > 0) {
      for (const userId of shareWithUsers) {
        const sharedEncryptParams = {
          KeyId: KMS_KEY_ID,
          Plaintext: passwordBuffer,
          EncryptionContext: { userId, purpose: 'password-manager' },
        };
        const sharedKmsResponse = await kms.send(new EncryptCommand(sharedEncryptParams));
        result.sharedWith.users.push({
          userId,
          encryptedPassword: arrayBufferToBase64(sharedKmsResponse.CiphertextBlob),
        });
      }
    }

    if (shareWithGroups.length > 0) {
      for (const groupId of shareWithGroups) {
        const groupEncryptParams = {
          KeyId: KMS_KEY_ID,
          Plaintext: passwordBuffer,
          EncryptionContext: { groupId, purpose: 'password-manager' },
        };
        const groupKmsResponse = await kms.send(new EncryptCommand(groupEncryptParams));
        result.sharedWith.groups.push({
          groupId,
          encryptedPassword: arrayBufferToBase64(groupKmsResponse.CiphertextBlob),
        });
      }
    }

    return JSON.stringify(result);
  } catch (error) {
    console.error('KMS encryption error:', error);
    throw error;
  }
};

export const decryptPassword = async (encryptedData, idToken, encryptionContext = { purpose: "password-manager" }) => {
  try {
    let parsedData;
    if (typeof encryptedData === 'string' && (encryptedData.startsWith('{') || encryptedData.startsWith('['))) {
      parsedData = JSON.parse(encryptedData);
    } else if (typeof encryptedData === 'object' && encryptedData !== null) {
      parsedData = encryptedData;
    } else {
      parsedData = { encryptedPassword: encryptedData, sharedWith: { users: [], groups: [] } };
    }

    const kms = await initKMS(idToken);

    const tokenPayload = JSON.parse(atob(idToken.split('.')[1]));
    const userId = tokenPayload.sub;
    let userGroups = tokenPayload["cognito:groups"] || [];
    if (typeof userGroups === "string") {
      userGroups = userGroups.split(" ").filter(g => g);
    } else if (!Array.isArray(userGroups)) {
      userGroups = [];
    }

    let ciphertext = parsedData.encryptedPassword;

    const sharedGroups = parsedData.sharedWith?.groups || [];
    const matchingGroup = sharedGroups.find(g => userGroups.includes(g.groupId));
    if (matchingGroup) {
      encryptionContext = { groupId: matchingGroup.groupId, purpose: "password-manager" };
      ciphertext = matchingGroup.encryptedPassword;
    } else if (parsedData.sharedWith?.users?.length > 0) {
      const matchingUser = parsedData.sharedWith.users.find(u => u.userId === userId);
      if (matchingUser) {
        encryptionContext = { userId, purpose: "password-manager" };
        ciphertext = matchingUser.encryptedPassword;
      }
    }

    if (!ciphertext || typeof ciphertext !== "string") {
      throw new Error("Invalid ciphertext: Ciphertext is missing or not a string");
    }

    const ciphertextBlob = base64ToUint8Array(ciphertext);

    const decryptParams = {
      CiphertextBlob: ciphertextBlob,
      EncryptionContext: encryptionContext,
    };

    const kmsResponse = await kms.send(new DecryptCommand(decryptParams));
    const decryptedBuffer = kmsResponse.Plaintext;
    const decoder = new TextDecoder();
    const plaintext = decoder.decode(decryptedBuffer);
    return plaintext;
  } catch (error) {
    console.error("KMS decryption error:", error);
    throw error;
  }
};