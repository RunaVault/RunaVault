import React, { useState, useEffect, useRef } from "react";
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  ChangePasswordCommand,
  GetUserCommand,
  GlobalSignOutCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand
} from "@aws-sdk/client-cognito-identity-provider";
import UserInfoTab from "./UserInfoTab";
import SecretsTab from "./SecretsTab";
import CreateSecretForm from "./CreateSecretForm";
import AdminPanel from "./AdminPanel";
import { useTheme } from "./ThemeContext";
import initBackgroundAnimation from "./BackgroundAnimation";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faSignOutAlt, faUsersCog, faPlus, faMoon, faSun, faChevronUp, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import "./App.css";
import QRCode from 'qrcode';
import { AppProvider, useAppContext } from './AppContext';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.REACT_APP_AWS_REGION,
});

const ChangePasswordForm = ({ accessToken, onSuccess, onCancel }) => {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [validationErrors, setValidationErrors] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  const validateForm = () => {
    const errors = {};
    if (!oldPassword) errors.oldPassword = "Old password is required";
    if (!newPassword) errors.newPassword = "New password is required";
    if (!confirmPassword) errors.confirmPassword = "Confirm password is required";
    if (newPassword !== confirmPassword) errors.confirmPassword = "Passwords do not match";
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!validateForm()) return;

    try {
      const command = new ChangePasswordCommand({
        AccessToken: accessToken,
        PreviousPassword: oldPassword,
        ProposedPassword: newPassword,
      });
      await cognitoClient.send(command);
      setSuccess("Password changed successfully");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onSuccess();
    } catch (err) {
      console.error("Change Password Error:", err);
      if (err.name === "NotAuthorizedException") {
        setError("Incorrect old password");
      } else if (err.name === "InvalidParameterException") {
        setError("New password does not meet requirements");
      } else {
        setError(err.message || "Failed to change password");
      }
    }
  };

  return (
    <div className="change-password-form mt-4">
      <h3>Change Password</h3>
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="alert alert-success" role="alert">
          {success}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <input
            type="password"
            className={`form-control ${validationErrors.oldPassword ? 'is-invalid' : ''}`}
            placeholder="Old password"
            value={oldPassword}
            onChange={(e) => {
              setOldPassword(e.target.value);
              setValidationErrors(prev => ({...prev, oldPassword: ""}));
            }}
          />
          {validationErrors.oldPassword && (
            <div className="invalid-feedback">{validationErrors.oldPassword}</div>
          )}
        </div>
        <div className="mb-3">
          <input
            type="password"
            className={`form-control ${validationErrors.newPassword ? 'is-invalid' : ''}`}
            placeholder="New password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setValidationErrors(prev => ({...prev, newPassword: ""}));
            }}
          />
          {validationErrors.newPassword && (
            <div className="invalid-feedback">{validationErrors.newPassword}</div>
          )}
        </div>
        <div className="mb-3">
          <input
            type="password"
            className={`form-control ${validationErrors.confirmPassword ? 'is-invalid' : ''}`}
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setValidationErrors(prev => ({...prev, confirmPassword: ""}));
            }}
          />
          {validationErrors.confirmPassword && (
            <div className="invalid-feedback">{validationErrors.confirmPassword}</div>
          )}
        </div>
        <div className="d-flex justify-content-center gap-3">
          <button type="submit" className="btn btn-primary">
            Save
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const ForgotPasswordForm = ({ onBackToLogin }) => {
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [validationErrors, setValidationErrors] = useState({
    email: "",
    verificationCode: "",
    newPassword: "",
    confirmPassword: ""
  });
  const { darkMode } = useTheme();

  const validateForm = () => {
    const errors = {};
    if (step === 1) {
      if (!email) {
        errors.email = "Email is required";
      } else if (!validateEmail(email)) {
        errors.email = "Please enter a valid email";
      }
    } else {
      if (!verificationCode) errors.verificationCode = "Verification code is required";
      if (!newPassword) errors.newPassword = "New password is required";
      if (!confirmPassword) errors.confirmPassword = "Confirm password is required";
      if (newPassword !== confirmPassword) errors.confirmPassword = "Passwords do not match";
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRequestCode = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!validateForm()) return;

    try {
      const command = new ForgotPasswordCommand({
        ClientId: process.env.REACT_APP_COGNITO_CLIENT_ID,
        Username: email
      });
      
      await cognitoClient.send(command);
      setStep(2);
      setMessage("Verification code has been sent \nto your email");
    } catch (err) {
      console.error("Error requesting code:", err);
      if (err.name === "UserNotFoundException") {
        setError("User with this email not found");
      } else {
        setError(err.message || "Error sending verification code");
      }
    }
  };

  const handleConfirmPassword = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!validateForm()) return;

    try {
      const command = new ConfirmForgotPasswordCommand({
        ClientId: process.env.REACT_APP_COGNITO_CLIENT_ID,
        Username: email,
        ConfirmationCode: verificationCode,
        Password: newPassword
      });
      
      await cognitoClient.send(command);
      setMessage("Password successfully changed. You can now login with your new password");
      setTimeout(() => {
        onBackToLogin();
      }, 3000);
    } catch (err) {
      console.error("Error confirming password:", err);
      if (err.name === "CodeMismatchException") {
        setError("Invalid verification code");
      } else if (err.name === "InvalidPasswordException") {
        setError("New password doesn't meet security requirements");
      } else {
        setError(err.message || "Error during password recovery");
      }
    }
  };

  return (
    <div className={`login-page-container ${darkMode ? 'dark-mode' : ''}`}>
      <canvas id="canvas" className="background-canvas"></canvas>
      <div className="auth-container p-4 text-center">
        <h1 className="mb-3 logo-header">RunaVault</h1>
        <p className="mb-4">
          {step === 1 ? "Password recovery" : "Enter verification code and new password"}
        </p>
        
        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="alert alert-info" role="alert">
            {message.split('\n').map((line, index) => (
              <React.Fragment key={index}>
                {line}
                <br />
              </React.Fragment>
            ))}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleRequestCode} className="login-form">
            <div className="mb-3">
              <input
                type="text"
                className={`form-control ${validationErrors.email ? 'is-invalid' : ''}`}
                placeholder="Email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setValidationErrors(prev => ({...prev, email: ""}));
                }}
              />
              {validationErrors.email && (
                <div className="invalid-feedback">{validationErrors.email}</div>
              )}
            </div>
            <div className="d-flex justify-content-center gap-3">
              <button type="submit" className="btn btn-primary">
                Send Code
              </button>
            </div>
            <div className="mt-3 text-center">
              <button
                type="button"
                className="btn btn-link text-decoration-none forgot-password"
                onClick={onBackToLogin}
              >
                Back to login
              </button>
            </div>            
          </form>
        ) : (
          <form onSubmit={handleConfirmPassword} className="login-form">
            <div className="mb-3">
              <input
                type="text"
                className={`form-control ${validationErrors.verificationCode ? 'is-invalid' : ''}`}
                placeholder="Verification code"
                value={verificationCode}
                onChange={(e) => {
                  setVerificationCode(e.target.value);
                  setValidationErrors(prev => ({...prev, verificationCode: ""}));
                }}
              />
              {validationErrors.verificationCode && (
                <div className="invalid-feedback">{validationErrors.verificationCode}</div>
              )}
            </div>
            <div className="mb-3">
              <input
                type="password"
                className={`form-control ${validationErrors.newPassword ? 'is-invalid' : ''}`}
                placeholder="New password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setValidationErrors(prev => ({...prev, newPassword: ""}));
                }}
              />
              {validationErrors.newPassword && (
                <div className="invalid-feedback">{validationErrors.newPassword}</div>
              )}
            </div>
            <div className="mb-3">
              <input
                type="password"
                className={`form-control ${validationErrors.confirmPassword ? 'is-invalid' : ''}`}
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setValidationErrors(prev => ({...prev, confirmPassword: ""}));
                }}
              />
              {validationErrors.confirmPassword && (
                <div className="invalid-feedback">{validationErrors.confirmPassword}</div>
              )}
            </div>
            <div className="d-flex justify-content-center gap-3">
              <button type="submit" className="btn btn-primary">
                Change Password
              </button>
            </div>
            <div className="mt-3 text-center">
              <button
                type="button"
                className="btn btn-link text-decoration-none forgot-password"
                onClick={onBackToLogin}
              >
                Back to login
              </button>
            </div>            
          </form>
        )}
      </div>
    </div>
  );
};

const LoginForm = ({ onSignIn, onSignOut }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [challenge, setChallenge] = useState(null);
  const [session, setSession] = useState(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState({
    email: "",
    password: "",
    mfaCode: "",
    newPassword: "",
    confirmNewPassword: "",
    verificationCode: ""
  });
  const { darkMode } = useTheme();
  
  const [secretCode, setSecretCode] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const canvasRef = useRef(null);
  
  const [copyMessage, setCopyMessage] = useState("");

  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const setupMFA = async () => {
    try {
      const associateTokenCommand = new AssociateSoftwareTokenCommand({
        Session: session
      });
      
      const response = await cognitoClient.send(associateTokenCommand);
      
      if (response.SecretCode) {
        setSecretCode(response.SecretCode);
        
        const otpauth = `otpauth://totp/RunaVault:${email}?secret=${response.SecretCode}&issuer=RunaVault`;
        
        if (canvasRef.current) {
          await QRCode.toCanvas(canvasRef.current, otpauth, { width: 200 });
        }
        
        setQrCodeUrl(otpauth);
      }
      
      if (response.Session) {
        setSession(response.Session);
      }
    } catch (error) {
      console.error("Error setting up MFA:", error);
      setError(error.message || "Failed to set up MFA");
    }
  };
  
  const verifyMfaToken = async () => {
    try {
      const verifyCommand = new VerifySoftwareTokenCommand({
        Session: session,
        UserCode: verificationCode
      });
      
      const response = await cognitoClient.send(verifyCommand);
      
      if (response.Status === 'SUCCESS') {
        const challengeCommand = new RespondToAuthChallengeCommand({
          ClientId: process.env.REACT_APP_COGNITO_CLIENT_ID,
          ChallengeName: "MFA_SETUP",
          Session: response.Session,
          ChallengeResponses: {
            USERNAME: email,
            ANSWER: verificationCode
          }
        });
        
        try {
          const challengeResponse = await cognitoClient.send(challengeCommand);
          
          if (challengeResponse.AuthenticationResult) {
            const tokens = {
              id_token: challengeResponse.AuthenticationResult.IdToken,
              access_token: challengeResponse.AuthenticationResult.AccessToken,
              refresh_token: challengeResponse.AuthenticationResult.RefreshToken
            };
            await onSignIn(tokens, setError);
            
            setVerificationCode("");
            setSecretCode("");
            setQrCodeUrl("");
            setChallenge(null);
          } else if (challengeResponse.ChallengeName) {
            setChallenge(challengeResponse.ChallengeName);
            setSession(challengeResponse.Session);
            setMessage(`MFA setup successful. Next challenge: ${challengeResponse.ChallengeName}`);
          } else {
            setChallenge(null);
            setMessage("MFA setup successful! Please sign in again");
            setTimeout(() => {
              setEmail("");
              setPassword("");
              setVerificationCode("");
              setSession(null);
              setSecretCode("");
              setQrCodeUrl("");
              setMessage("");
            }, 3000);
          }
        } catch (error) {
          console.error("Error completing MFA setup:", error);
          setError(error.message || "Failed to complete MFA setup");
        }
      } else {
        setError("Failed to verify MFA code. Please try again");
      }
    } catch (error) {
      console.error("Error verifying MFA code:", error);
      setError(error.message || "Failed to verify MFA code");
    }
  };

  useEffect(() => {
    if (challenge === "MFA_SETUP" && !secretCode && session) {
      setupMFA();
    }
  }, [challenge, secretCode, session]);

  const copySecretCode = () => {
    if (secretCode) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = secretCode;
        textarea.style.position = 'fixed';
        textarea.style.opacity = 0;
        document.body.appendChild(textarea);
        
        textarea.select();
        
        try {
          navigator.clipboard.writeText(secretCode);
        } catch (err) {
          document.execCommand('copy');
        }
        
        document.body.removeChild(textarea);
        
        setCopyMessage("Code copied to clipboard!");
        setTimeout(() => setCopyMessage(""), 3000);
      } catch (err) {
        console.error("Failed to copy code: ", err);
        setError("Failed to copy code to clipboard");
      }
    }
  };

  if (showForgotPassword) {
    return <ForgotPasswordForm onBackToLogin={() => setShowForgotPassword(false)} />;
  }

  const validateForm = () => {
    const errors = {};
    if (!email) {
      errors.email = "Email is required";
    } else if (!validateEmail(email)) {
      errors.email = "Please enter a valid email";
    }
    if (!password && !challenge) errors.password = "Password is required";
    if (challenge === "SMS_MFA" && !mfaCode) errors.mfaCode = "MFA code is required";
    if (challenge === "NEW_PASSWORD_REQUIRED") {
      if (!newPassword) errors.newPassword = "New password is required";
      if (!confirmNewPassword) errors.confirmNewPassword = "Confirm password is required";
      if (newPassword !== confirmNewPassword) errors.confirmNewPassword = "Passwords do not match";
    }
    if (challenge === "MFA_SETUP" && verificationCode) {
      if (!verificationCode) {
        errors.verificationCode = "Verification code is required";
      } else if (!/^\d{6}$/.test(verificationCode)) {
        errors.verificationCode = "Please enter a valid 6-digit code";
      }
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!validateForm()) return;

    try {
      if (challenge === "MFA_SETUP" && verificationCode) {
        await verifyMfaToken();
      } else if (challenge === "NEW_PASSWORD_REQUIRED") {
        if (newPassword !== confirmNewPassword) {
          setError("New passwords do not match");
          return;
        }

        try {
          const challengeCommand = new RespondToAuthChallengeCommand({
            ClientId: process.env.REACT_APP_COGNITO_CLIENT_ID,
            ChallengeName: "NEW_PASSWORD_REQUIRED",
            Session: session,
            ChallengeResponses: {
              USERNAME: email,
              NEW_PASSWORD: newPassword
            }
          });
          
          const challengeResponse = await cognitoClient.send(challengeCommand);
          console.log("Challenge Response:", challengeResponse);

          if (challengeResponse.ChallengeName) {
            setChallenge(challengeResponse.ChallengeName);
            setSession(challengeResponse.Session);
            setMessage(
              challengeResponse.ChallengeName === "MFA_SETUP"
                ? "Please set up MFA authentication"
                : `Next challenge: ${challengeResponse.ChallengeName}`
            );
          } else if (challengeResponse.AuthenticationResult) {
            const tokens = {
              id_token: challengeResponse.AuthenticationResult.IdToken,
              access_token: challengeResponse.AuthenticationResult.AccessToken,
              refresh_token: challengeResponse.AuthenticationResult.RefreshToken
            };
            await onSignIn(tokens, setError);
            setChallenge(null);
            setNewPassword("");
            setConfirmNewPassword("");
          } else {
            setError("Failed to complete new password challenge");
          }
        } catch (error) {
          console.error("New password challenge error:", error);
          if (error.name === "InvalidParameterException" && error.message.includes("Cannot modify an already provided email")) {
            setError("Email is already confirmed. Please try again without modifying email");
          } else {
            setError(error.message || "Failed to complete new password challenge");
          }
        }
      } else if (challenge === "SMS_MFA" || challenge === "SOFTWARE_TOKEN_MFA") {
        const challengeCommand = new RespondToAuthChallengeCommand({
          ClientId: process.env.REACT_APP_COGNITO_CLIENT_ID,
          ChallengeName: challenge,
          ChallengeResponses: {
            USERNAME: email,
            [challenge === "SMS_MFA" ? "SMS_MFA_CODE" : "SOFTWARE_TOKEN_MFA_CODE"]: mfaCode,
          },
          Session: session,
        });
        const challengeResponse = await cognitoClient.send(challengeCommand);
        console.log("MFA Challenge Response:", challengeResponse);

        if (challengeResponse.AuthenticationResult) {
          const tokens = {
            id_token: challengeResponse.AuthenticationResult.IdToken,
            access_token: challengeResponse.AuthenticationResult.AccessToken,
            refresh_token: challengeResponse.AuthenticationResult.RefreshToken
          };
          await onSignIn(tokens, setError);
          setChallenge(null);
          setMfaCode("");
        } else if (challengeResponse.ChallengeName) {
          setChallenge(challengeResponse.ChallengeName);
          setSession(challengeResponse.Session);
          setMessage(`Next challenge: ${challengeResponse.ChallengeName}`);
        } else {
          setError("Invalid MFA code");
        }
      } else {
        const command = new InitiateAuthCommand({
          AuthFlow: "USER_PASSWORD_AUTH",
          ClientId: process.env.REACT_APP_COGNITO_CLIENT_ID,
          AuthParameters: {
            USERNAME: email,
            PASSWORD: password,
          },
        });
        const response = await cognitoClient.send(command);
        console.log("Cognito Response:", response);

        if (response.ChallengeName) {
          setChallenge(response.ChallengeName);
          setSession(response.Session);
          setMessage(
            response.ChallengeName === "NEW_PASSWORD_REQUIRED"
              ? "Please set a new password"
              : response.ChallengeName === "SMS_MFA"
              ? "Please enter the MFA code sent to your phone"
              : response.ChallengeName === "SOFTWARE_TOKEN_MFA"
              ? "Please enter the MFA code \nfrom your authenticator app"
              : response.ChallengeName === "MFA_SETUP"
              ? ""
              : `Unsupported challenge: ${response.ChallengeName}`
          );
        } else if (response.AuthenticationResult) {
          const tokens = {
            id_token: response.AuthenticationResult.IdToken,
            access_token: response.AuthenticationResult.AccessToken,
            refresh_token: response.AuthenticationResult.RefreshToken
          };
          await onSignIn(tokens, setError);
        } else {
          setError("Unexpected response from Cognito");
        }
      }
    } catch (err) {
      console.error("Authentication Error:", err);
      if (err.name === "NotAuthorizedException") {
        setError("Incorrect username or password");
      } else if (err.name === "UserNotFoundException") {
        setError("User does not exist");
      } else if (err.name === "PasswordResetRequiredException") {
        setError("Password reset required. Please contact support");
      } else if (err.name === "InvalidParameterException") {
        setError("Invalid input provided");
      } else {
        setError(err.message || "Failed to sign in");
      }
    }
  };

  return (
    <div className={`login-page-container ${darkMode ? 'dark-mode' : ''}`}>
      <canvas id="canvas" className="background-canvas"></canvas>
      <div className="auth-container p-4 text-center">
        <h1 className="mb-3 logo-header">RunaVault</h1>
        <p className="mb-4">
          {challenge === "NEW_PASSWORD_REQUIRED"
            ? ""
            : challenge === "SMS_MFA"
            ? "Enter MFA code"
            : challenge === "SOFTWARE_TOKEN_MFA"
            ? ""
            : challenge === "MFA_SETUP"
            ? ""
            : "Please sign in to continue"}
        </p>
        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="alert alert-info" role="alert">
              {message.split('\n').map((line, index) => (
                <React.Fragment key={index}>
                  {line}
                  <br />
                </React.Fragment>
              ))}
            </div>
          )}
          
          {/* Display different forms depending on the challenge */}
          {challenge === "MFA_SETUP" ? (
            <>
              <div className="mb-4 text-center">
                <h4 className="mb-3">Multi-factor <br />authentication setup</h4>
                <div className="alert alert-info mb-3" role="alert">
                  <p className="mb-1"><strong>Step 1:</strong> Install an authenticator app<br /> on your phone:</p>
                  <ul className="text-start mb-0">
                    <li>Google Authenticator</li>
                    <li>Microsoft Authenticator</li>
                    <li>Authy</li>
                  </ul>
                </div>
                
                <div className="alert alert-info mb-3" role="alert">
                  <p className="mb-1"><strong>Step 2:</strong> Scan the QR code in the app:</p>
                </div>
                
                <div className="card mb-4">
                  <div className="card-body">
                    <div className="d-flex justify-content-center mb-3">
                      <canvas ref={canvasRef} className="qr-code-canvas"></canvas>
                    </div>
                    {secretCode && (
                      <div className="mb-3">
                        <p className="fw-bold mb-2">Or enter this code manually:</p>
                        <p className="secret-code" onClick={copySecretCode} title="Click to copy">
                          {secretCode}
                        </p>
                        {copyMessage && (
                          <div className="copy-message text-success">
                            {copyMessage}
                          </div>
                        )}
                        <small className="text-muted">Click on the code to copy it to clipboard</small>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="alert alert-info mb-3" role="alert">
                  <p className="mb-1"><strong>Step 3:</strong> Enter the 6-digit code generated <br />by the app:</p>
                </div>
                
                <div className="mb-3">
                  <input
                    type="text"
                    className={`input-code form-control form-control-lg text-center ${validationErrors.verificationCode ? 'is-invalid' : ''}`}
                    placeholder="Enter 6-digit code from app"
                    value={verificationCode}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '').substring(0, 6);
                      setVerificationCode(value);
                      setValidationErrors(prev => ({...prev, verificationCode: ""}));
                    }}
                    autoFocus
                  />
                  {validationErrors.verificationCode && (
                    <div className="invalid-feedback">{validationErrors.verificationCode}</div>
                  )}
                </div>
                <button type="submit" className="btn btn-lg btn-primary w-100">
                  Verify
                </button>
              </div>
            </>
          ) : (
            <>
              {(!challenge || challenge === "NEW_PASSWORD_REQUIRED") && (
                <div className="mb-3">
                  <input
                    type="text"
                    className={`form-control ${validationErrors.email ? 'is-invalid' : ''}`}
                    placeholder="Email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setValidationErrors(prev => ({...prev, email: ""}));
                    }}
                    disabled={challenge === "NEW_PASSWORD_REQUIRED"}
                  />
                  {validationErrors.email && (
                    <div className="invalid-feedback">{validationErrors.email}</div>
                  )}
                </div>
              )}
              {(!challenge || challenge === "NEW_PASSWORD_REQUIRED") && (
                <div className="mb-3">
                  <input
                    type="password"
                    className={`form-control ${validationErrors.password ? 'is-invalid' : ''}`}
                    placeholder={challenge === "NEW_PASSWORD_REQUIRED" ? "Current password" : "Password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setValidationErrors(prev => ({...prev, password: ""}));
                    }}
                    disabled={challenge === "NEW_PASSWORD_REQUIRED"}
                  />
                  {validationErrors.password && (
                    <div className="invalid-feedback">{validationErrors.password}</div>
                  )}
                </div>
              )}
              {challenge === "NEW_PASSWORD_REQUIRED" && (
                <>
                  <div className="mb-3">
                    <input
                      type="password"
                      className={`form-control ${validationErrors.newPassword ? 'is-invalid' : ''}`}
                      placeholder="New password"
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        setValidationErrors(prev => ({...prev, newPassword: ""}));
                      }}
                    />
                    {validationErrors.newPassword && (
                      <div className="invalid-feedback">{validationErrors.newPassword}</div>
                    )}
                  </div>
                  <div className="mb-3">
                    <input
                      type="password"
                      className={`form-control ${validationErrors.confirmNewPassword ? 'is-invalid' : ''}`}
                      placeholder="Confirm new password"
                      value={confirmNewPassword}
                      onChange={(e) => {
                        setConfirmNewPassword(e.target.value);
                        setValidationErrors(prev => ({...prev, confirmNewPassword: ""}));
                      }}
                    />
                    {validationErrors.confirmNewPassword && (
                      <div className="invalid-feedback">{validationErrors.confirmNewPassword}</div>
                    )}
                  </div>
                </>
              )}
              {(challenge === "SMS_MFA" || challenge === "SOFTWARE_TOKEN_MFA") && (
                <div className="mb-3">
                  <input
                    type="text"
                    className={`form-control ${validationErrors.mfaCode ? 'is-invalid' : ''}`}
                    placeholder={challenge === "SMS_MFA" ? "SMS MFA code" : "Authenticator code"}
                    value={mfaCode}
                    onChange={(e) => {
                      setMfaCode(e.target.value);
                      setValidationErrors(prev => ({...prev, mfaCode: ""}));
                    }}
                  />
                  {validationErrors.mfaCode && (
                    <div className="invalid-feedback">{validationErrors.mfaCode}</div>
                  )}
                </div>
              )}
              <div className="d-flex justify-content-center gap-3">
                <button type="submit" className="btn btn-primary">
                  {challenge === "NEW_PASSWORD_REQUIRED"
                    ? "Update Password"
                    : challenge === "SMS_MFA" || challenge === "SOFTWARE_TOKEN_MFA"
                    ? "Verify Code"
                    : "Sign In"}
                </button>
              </div>
              {!challenge && (
                <div className="mt-3 text-center">
                  <button
                    type="button"
                    className="btn btn-link text-decoration-none forgot-password"
                    onClick={() => setShowForgotPassword(true)}
                  >
                    Forgot password?
                  </button>
                </div>
              )}
            </>
          )}
        </form>
      </div>
    </div>
  );
};

function App() {
  const { darkMode, toggleDarkMode } = useTheme();
  const [activeTab, setActiveTab] = useState("secrets");
  const [isCreatingSecret, setIsCreatingSecret] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [hasSharedWithMeSecrets, setHasSharedWithMeSecrets] = useState(false);
  const [userGroups, setUserGroups] = useState([]);
  const [lastGroupRefresh, setLastGroupRefresh] = useState(0);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userTokens, setUserTokens] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [idToken, setIdToken] = useState(null);
  const [user, setUser] = useState(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [mfaSecret, setMfaSecret] = useState(null);
  const [mfaQrCode, setMfaQrCode] = useState(null);
  const [mfaVerificationCode, setMfaVerificationCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [mfaSuccess, setMfaSuccess] = useState("");
  const [sharedWithMeCount, setSharedWithMeCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(null);
  const [refreshSuccess, setRefreshSuccess] = useState(false);
  const { secrets, fetchSecrets, fetchUsers, updateSecrets, resetState } = useAppContext();
  const [isGroupsExpanded, setIsGroupsExpanded] = useState(false);
  const [showExpandButton, setShowExpandButton] = useState(false);
  const groupTabsRef = useRef(null);

  useEffect(() => {
    const checkAuth = async () => {
      const storedAccessToken = localStorage.getItem('accessToken');
      const storedIdToken = localStorage.getItem('idToken');
      const storedRefreshToken = localStorage.getItem('refreshToken');
      const storedExpiresIn = localStorage.getItem('expiresIn');
      const storedTokenTimestamp = localStorage.getItem('tokenTimestamp');
      if (storedAccessToken && storedIdToken && storedRefreshToken && storedExpiresIn && storedTokenTimestamp) {
        const currentTime = Math.floor(Date.now() / 1000);
        const tokenAge = currentTime - parseInt(storedTokenTimestamp);
        const expiresIn = parseInt(storedExpiresIn);

        if (tokenAge >= expiresIn - 300) {
          try {
            const command = new InitiateAuthCommand({
              AuthFlow: "REFRESH_TOKEN_AUTH",
              ClientId: process.env.REACT_APP_COGNITO_CLIENT_ID,
              AuthParameters: {
                REFRESH_TOKEN: storedRefreshToken
              }
            });

            const response = await cognitoClient.send(command);
            
            if (response.AuthenticationResult) {
              const newTokens = {
                id_token: response.AuthenticationResult.IdToken,
                access_token: response.AuthenticationResult.AccessToken,
                refresh_token: response.AuthenticationResult.RefreshToken || storedRefreshToken
              };
              
              localStorage.setItem('accessToken', newTokens.access_token);
              localStorage.setItem('idToken', newTokens.id_token);
              if (newTokens.refresh_token) {
                localStorage.setItem('refreshToken', newTokens.refresh_token);
              }
              localStorage.setItem('expiresIn', response.AuthenticationResult.ExpiresIn.toString());
              localStorage.setItem('tokenTimestamp', Math.floor(Date.now() / 1000).toString());
              
              setAccessToken(newTokens.access_token);
              setIdToken(newTokens.id_token);
              setUserTokens(newTokens);
              
              const userCommand = new GetUserCommand({
                AccessToken: newTokens.access_token
              });
              
              const userData = await cognitoClient.send(userCommand);
              setUserInfo({
                username: userData.Username,
                attributes: userData.UserAttributes.reduce((acc, attr) => {
                  acc[attr.Name] = attr.Value;
                  return acc;
                }, {})
              });
              
              setIsAuthenticated(true);
            } else {
              throw new Error('Failed to refresh token');
            }
          } catch (error) {
            console.error('Token refresh failed:', error);
            cleanAndSignOut();
          }
        } else {
          setAccessToken(storedAccessToken);
          setIdToken(storedIdToken);
          setUserTokens({
            id_token: storedIdToken,
            access_token: storedAccessToken,
            refresh_token: storedRefreshToken
          });
          
          try {
            const command = new GetUserCommand({
              AccessToken: storedAccessToken
            });
            
            const userData = await cognitoClient.send(command);
            setUserInfo({
              username: userData.Username,
              attributes: userData.UserAttributes.reduce((acc, attr) => {
                acc[attr.Name] = attr.Value;
                return acc;
              }, {})
            });
            
            setIsAuthenticated(true);
          } catch (error) {
            console.error('Token validation failed:', error);
            cleanAndSignOut();
          } finally {
            setIsLoading(false);
          }
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setTimeout(() => {
        initBackgroundAnimation();
      }, 100);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const checkSession = async () => {
      const idToken = localStorage.getItem("id_token");
      const accessToken = localStorage.getItem("access_token");
      const refreshToken = localStorage.getItem("refresh_token");
      const tokenTimestamp = localStorage.getItem("tokenTimestamp");
      const expiresIn = localStorage.getItem("expiresIn");
      
      if (idToken && accessToken && refreshToken && tokenTimestamp && expiresIn) {
        try {
          setIsLoading(true);
          
          const currentTime = Math.floor(Date.now() / 1000);
          const tokenAge = currentTime - parseInt(tokenTimestamp);
          const tokenExpiresIn = parseInt(expiresIn);
          
          if (tokenAge >= tokenExpiresIn - 300) {
            console.log("Token expired or about to expire, refreshing...");
            const tokens = {
              id_token: idToken,
              access_token: accessToken,
              refresh_token: refreshToken
            };
            setUserTokens(tokens);
            const refreshed = await refreshTokenAndUserInfo();
            if (!refreshed) {
              throw new Error("Failed to refresh token");
            }
            window.location.reload();
          } else {
            try {
              const command = new GetUserCommand({
                AccessToken: accessToken
              });
              
              const userData = await cognitoClient.send(command);
              setUserInfo({
                username: userData.Username,
                attributes: userData.UserAttributes.reduce((acc, attr) => {
                  acc[attr.Name] = attr.Value;
                  return acc;
                }, {})
              });
              
              setUserTokens({ 
                id_token: idToken, 
                access_token: accessToken,
                refresh_token: refreshToken 
              });
              setIsAuthenticated(true);
            } catch (error) {
              if (error.name === "NotAuthorizedException" && error.message.includes("Access Token has expired")) {
                console.log("Token expired, attempting to refresh...");
                const tokens = {
                  id_token: idToken,
                  access_token: accessToken,
                  refresh_token: refreshToken
                };
                setUserTokens(tokens);
                const refreshed = await refreshTokenAndUserInfo();
                if (!refreshed) {
                  throw new Error("Failed to refresh token");
                }
                window.location.reload();
              } else {
                throw error;
              }
            }
          }
        } catch (error) {
          console.error("Session validation failed, attempting to refresh tokens:", error);
          const tokens = {
            id_token: idToken,
            access_token: accessToken,
            refresh_token: refreshToken
          };
          setUserTokens(tokens);
          const refreshed = await refreshTokenAndUserInfo();
          if (!refreshed) {
            cleanAndSignOut();
          }
          setIsAuthenticated(true);
          window.location.reload();
        } finally {
          setIsLoading(false);
        }
      }
    };

    checkSession();
  }, []);

  const handleSignIn = async (tokens, setError) => {
    try {
      localStorage.setItem("id_token", tokens.id_token);
      localStorage.setItem("access_token", tokens.access_token);
      if (tokens.refresh_token) {
        localStorage.setItem("refresh_token", tokens.refresh_token);
      }
      localStorage.setItem("tokenTimestamp", Math.floor(Date.now() / 1000).toString());
      localStorage.setItem("expiresIn", "3600");
      
      const command = new GetUserCommand({
        AccessToken: tokens.access_token
      });
      
      const userData = await cognitoClient.send(command);
      setUserInfo({
        username: userData.Username,
        attributes: userData.UserAttributes.reduce((acc, attr) => {
          acc[attr.Name] = attr.Value;
          return acc;
        }, {})
      });
      
      setUserTokens(tokens);
      setIsAuthenticated(true);
    } catch (error) {
      console.error("Error processing sign-in:", error);
      if (setError) {
        setError("Failed to process authentication. Please try again");
      } else {
        setAuthError(error);
      }
    }
  };

  const signOut = async () => {
    try {
      if (userTokens?.access_token) {
        const command = new GlobalSignOutCommand({
          AccessToken: userTokens.access_token
        });
        await cognitoClient.send(command);
      }
    } catch (error) {
      console.error("Error during sign out:", error);
    } finally {
      cleanAndSignOut();
    }
  };

  const cleanAndSignOut = () => {
    localStorage.clear();
    sessionStorage.clear();

    document.cookie.split(";").forEach(function(c) {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, 
        "=;expires=" + new Date().toUTCString() + ";path=/");
    });

    setIsAuthenticated(false);
    setUserTokens(null);
    setUserInfo(null);
    setAuthError(null);
    setAccessToken(null);
    setIdToken(null);
    setUser(null);
    setShowAdminPanel(false);
    setShowChangePassword(false);
    setShowForgotPassword(false);
    setShowMfaSetup(false);
    setMfaSecret(null);
    setMfaQrCode(null);
    setMfaVerificationCode("");
    setMfaError("");
    setMfaSuccess("");
    setSharedWithMeCount(0);
    setIsRefreshing(false);
    setRefreshError(null);
    setRefreshSuccess(false);
    resetState();
  };

  const getUserGroups = () => {
    if (!userTokens?.id_token) return [];
    try {
      const payload = JSON.parse(atob(userTokens.id_token.split('.')[1]));
      return payload['cognito:groups'] || [];
    } catch (error) {
      console.error('Error decoding ID token:', error);
      return [];
    }
  };

  useEffect(() => {
    if (userTokens?.id_token) {
      const groups = getUserGroups();
      setUserGroups(groups);
    }
  }, [userTokens?.id_token]);

  useEffect(() => {
    if (userGroups.length > 0) {
      resetSecretsData();
    }
  }, [userGroups]);

  const fetchSharedWithMeCount = async () => {
    if (!isAuthenticated || !userTokens?.access_token) return;
    
    try {
      const userId = userInfo?.username || JSON.parse(atob(userTokens.id_token.split('.')[1])).sub;
      
      const sharedWithMeSecrets = secrets?.secrets?.filter(secret => 
        secret.shared_with?.users?.includes(userId) && !secret.owned_by_me
      ) || [];
      
      setHasSharedWithMeSecrets(sharedWithMeSecrets.length > 0);
    } catch (error) {
      console.error("Error fetching shared secrets count:", error);
      setHasSharedWithMeSecrets(false);
    }
  };

  const updateSecretsData = (data) => {
    updateSecrets(data);
    const userId = userInfo?.username || JSON.parse(atob(userTokens.id_token.split('.')[1])).sub;
    const sharedWithMeSecrets = data.secrets.filter(secret => 
      secret.shared_with?.users?.includes(userId) && !secret.owned_by_me
    );
    setHasSharedWithMeSecrets(sharedWithMeSecrets.length > 0);
  };

  useEffect(() => {
    if (isAuthenticated && secrets) {
      fetchSharedWithMeCount();
    }
  }, [isAuthenticated, secrets]);

  const isAdmin = userGroups.includes("Admin");

  useEffect(() => {
    if (activeTab === "secrets" && selectedGroup) {
      if (secrets) {
      }
    }
  }, [selectedGroup, activeTab, secrets]);

  const resetSecretsData = () => {
    resetState();
  };

  const refreshTokenAndUserInfo = async () => {
    if (!localStorage.getItem("refresh_token")) {
      console.error("No refresh token available");
      return false;
    }
    
    try {
      const command = new InitiateAuthCommand({
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: process.env.REACT_APP_COGNITO_CLIENT_ID,
        AuthParameters: {
          REFRESH_TOKEN: localStorage.getItem("refresh_token")
        }
      });
      
      const response = await cognitoClient.send(command);
      
      if (response.AuthenticationResult) {
        const newTokens = {
          id_token: response.AuthenticationResult.IdToken,
          access_token: response.AuthenticationResult.AccessToken,
        };
        
        localStorage.setItem("id_token", newTokens.id_token);
        localStorage.setItem("access_token", newTokens.access_token);
        localStorage.setItem("tokenTimestamp", Math.floor(Date.now() / 1000).toString());
        localStorage.setItem("expiresIn", response.AuthenticationResult.ExpiresIn.toString());
        
        setUserTokens(newTokens);
        
        const userCommand = new GetUserCommand({
          AccessToken: newTokens.access_token
        });
        
        const userData = await cognitoClient.send(userCommand);
        setUserInfo({
          username: userData.Username,
          attributes: userData.UserAttributes.reduce((acc, attr) => {
            acc[attr.Name] = attr.Value;
            return acc;
          }, {})
        });
        
        const groups = getUserGroups();
        setUserGroups(groups);
        
        resetSecretsData();
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error("Error refreshing tokens:", error);
      cleanAndSignOut();
      return false;
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      const refreshInterval = setInterval(async () => {
        await refreshTokenAndUserInfo();
      }, 30 * 60 * 1000);

      return () => clearInterval(refreshInterval);
    }
  }, [isAuthenticated]);

  const refreshSessionAndData = async () => {
    setIsRefreshing(true);
    setRefreshError(null);
    setRefreshSuccess(false);
    try {
      const success = await refreshTokenAndUserInfo();
      if (success) {
        setRefreshSuccess(true);
        const groups = getUserGroups();
        setUserGroups(groups);
        resetSecretsData();
        setLastGroupRefresh(Date.now());
      }
      return success;
    } catch (err) {
      setRefreshError(err.message);
      return false;
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (userTokens?.id_token) {
      const groups = getUserGroups();
      setUserGroups(groups);
    }
  }, [userTokens?.id_token, lastGroupRefresh]);

  useEffect(() => {
    if (userGroups.length > 0) {
      resetSecretsData();
    }
  }, [userGroups, lastGroupRefresh]);


  const checkTokenValidity = async () => {
    if (!userTokens?.access_token) {
      cleanAndSignOut();
      return false;
    }

    try {
      const command = new GetUserCommand({
        AccessToken: userTokens.access_token
      });
      
      await cognitoClient.send(command);
      return true;
    } catch (error) {
      console.error("Token validation failed:", error);
      cleanAndSignOut();
      return false;
    }
  };


  if (isLoading) {
    return (
      <div className="container py-3">
        <div className="text-center text-muted fs-5">Loading...</div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="container py-3">
        <div className="alert alert-danger text-center" role="alert">
          <h2>Authentication Error</h2>
          <p>{authError.message}</p>
          <button
            className="btn btn-danger"
            onClick={cleanAndSignOut}
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className={`app-wrapper ${darkMode ? 'dark-mode' : ''}`}>
        <header className="header">
          <div className="left-side-header">
            <h1 className="app-header-title">RunaVault</h1>
          </div>
          <div className="right-side-header">
            <button 
              className="btn theme-toggle-button"
              onClick={toggleDarkMode}
              title={darkMode ? "Switch to light theme" : "Switch to dark theme"}
            >
              <FontAwesomeIcon icon={darkMode ? faSun : faMoon} />
            </button>
            <button
              className="btn user-info"
              onClick={() => {
                setActiveTab("user-info");
                setShowAdminPanel(false);
                setShowChangePassword(false);
                setIsCreatingSecret(false);
              }}
            >
              <FontAwesomeIcon icon={faUser} className="me-2" />
              {userInfo?.attributes?.email || "User"}
            </button>
            {isAdmin && (
              <button
                className="btn admin-button"
                onClick={() => setShowAdminPanel(prev => !prev)}
              >
                <FontAwesomeIcon icon={faUsersCog} className="me-2" />
                Admin Panel
              </button>
            )}
            <button
              className="btn logout"
              onClick={signOut}
            >
              <FontAwesomeIcon icon={faSignOutAlt} className="me-2" />
              Sign Out
            </button>
          </div>
        </header>

        <div className="container py-3">
          <div className="auth-container p-4">
            {showAdminPanel && isAdmin ? (
              <AdminPanel
                accessToken={userTokens?.access_token}
                onClose={() => setShowAdminPanel(false)}
              />
            ) : (
              <>
                <div className={`group-tabs mb-3 ${isGroupsExpanded ? 'expanded' : ''}`}>
                  {!isCreatingSecret && (
                    <button
                      className="btn add-secret-btn me-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedGroup(null);
                        setIsCreatingSecret(true);
                        setActiveTab("secrets");
                      }}
                      title="Add a New Password"
                    >
                      <FontAwesomeIcon icon={faPlus} />
                    </button>
                  )}
                  <button
                    className={`btn tab-button ${activeTab === "secrets" && !selectedGroup ? "active" : ""} me-2`}
                    onClick={() => {
                      setActiveTab("secrets");
                      setSelectedGroup(null);
                      setIsCreatingSecret(false);
                      setShowChangePassword(false);
                    }}
                  >
                    My Secrets
                  </button>
                  {hasSharedWithMeSecrets && (
                    <button
                      className={`btn tab-button ${activeTab === "shared-with-me" ? "active" : ""} me-2`}
                      onClick={() => {
                        setActiveTab("shared-with-me");
                        setSelectedGroup(null);
                        setIsCreatingSecret(false);
                        setShowChangePassword(false);
                      }}
                    >
                      Shared with Me
                    </button>
                  )}
                  {userGroups.map(group => (
                    <button
                      key={group}
                      className={`btn tab-button ${activeTab === "secrets" && selectedGroup === group ? "active" : ""} me-2`}
                      title={`Group: ${group}`}
                      onClick={() => {
                        setActiveTab("secrets");
                        setSelectedGroup(group);
                        setIsCreatingSecret(false);
                        setShowChangePassword(false);
                      }}
                    >
                      {group}
                    </button>
                  ))}
                  {userGroups.length > 5 && (
                  <button
                    className="expand-button"
                    onClick={() => setIsGroupsExpanded(!isGroupsExpanded)}
                    title={isGroupsExpanded ? "Collapse groups" : "Expand groups"}
                  >
                    <FontAwesomeIcon icon={isGroupsExpanded ? faChevronUp : faChevronDown} />
                  </button>
                 )}
             </div>
                <div className="tab-content">
                  {activeTab === "user-info" && (
                    <>
                      {showChangePassword ? (
                        <ChangePasswordForm
                          accessToken={userTokens?.access_token}
                          idToken={userTokens?.id_token}
                          onSuccess={() => setShowChangePassword(false)}
                          onCancel={() => setShowChangePassword(false)}
                        />
                      ) : (
                        <div>
                          <UserInfoTab 
                            user={{...userInfo, id_token: userTokens?.id_token, access_token: userTokens?.access_token, refresh_token: userTokens?.refresh_token}} 
                            onRefreshSession={refreshSessionAndData}
                          />
                          <button
                            className="btn btn-primary mt-3"
                            onClick={() => setShowChangePassword(true)}
                          >
                            Change Password
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  {(activeTab === "secrets" || activeTab === "shared-with-me") && (
                    <>
                      {isCreatingSecret ? (
                        <CreateSecretForm
                          accessToken={userTokens?.access_token}
                          idToken={userTokens?.id_token}
                          onSecretCreated={() => {
                            setIsCreatingSecret(false);
                            resetSecretsData();
                          }}
                          onOpenForm={() => setIsCreatingSecret(true)}
                        />
                      ) : (
                        <SecretsTab
                          accessToken={userTokens?.access_token}
                          idToken={userTokens?.id_token}
                          group={selectedGroup}
                          mode={activeTab === "shared-with-me" ? "sharedWithMe" : undefined}
                          secretsData={secrets}
                          onUpdateSecretsData={updateSecretsData}
                        />
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <LoginForm onSignIn={handleSignIn} onSignOut={cleanAndSignOut} />;
}

export default function AppWrapper() {
  return (
    <AppProvider>
      <App />
    </AppProvider>
  );
}