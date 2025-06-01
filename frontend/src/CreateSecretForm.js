import React, { useState, useEffect } from "react";
import { encryptPassword, isCryptoSupported } from "./CryptoUtils";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash, faUsers, faShuffle } from '@fortawesome/free-solid-svg-icons';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import "./App.css";

function CreateSecretForm({ accessToken, idToken, onSecretCreated, onOpenForm }) {
  const [site, setSite] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [subdirectory, setSubdirectory] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const encryptionWarning = !isCryptoSupported();
  const [showSharingOptions, setShowSharingOptions] = useState(false);
  const [shareWithUsers, setShareWithUsers] = useState([]);
  const [shareWithGroups, setShareWithGroups] = useState([]);
  const [groupRoles, setGroupRoles] = useState({});
  const [availableUsers, setAvailableUsers] = useState([]);
  const [availableGroups, setAvailableGroups] = useState([]);
  const [passwordError, setPasswordError] = useState(null);
  const [userFilter, setUserFilter] = useState("");
  const [filteredAvailableUsers, setFilteredAvailableUsers] = useState([]);
  const [siteError, setSiteError] = useState(null);
  const [usernameError, setUsernameError] = useState(null);

  const MAX_SITE_LENGTH = 200;
  const MAX_USERNAME_LENGTH = 100;
  const MAX_SUBDIRECTORY_LENGTH = 500;
  const MIN_PASSWORD_LENGTH = 50;

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${process.env.REACT_APP_API_GATEWAY_ENDPOINT}list_users`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch users: ${response.status}`);
        }

        const data = await response.json();
        
        let currentUserId = null;
        if (idToken) {
          try {
            const payload = JSON.parse(atob(idToken.split('.')[1]));
            currentUserId = payload.sub;
          } catch (error) {
            console.error('Error decoding ID token:', error);
          }
        }
        
        const filteredUsers = data.users?.filter(user => user.value !== currentUserId) || [];
        
        setAvailableUsers(filteredUsers);
        setFilteredAvailableUsers(filteredUsers);
      } catch (err) {
        console.error("Error fetching users:", err);
        setError("Failed to load user list");
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();

    const groups = getUserGroupsFromToken(idToken);
    const groupOptions = groups.map(group => ({ value: group, label: group }));
    setAvailableGroups(groupOptions);
  }, [accessToken, idToken]);

  const getUserGroupsFromToken = (idToken) => {
    if (!idToken) return [];
    try {
      const payload = JSON.parse(atob(idToken.split('.')[1]));
      return payload['cognito:groups'] || [];
    } catch (error) {
      console.error('Error decoding ID token:', error);
      return [];
    }
  };

  const generatePassword = () => {
    const length = 16;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let newPassword = "";
    for (let i = 0; i < length; i++) {
      newPassword += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    setPassword(newPassword);
    setShowPassword(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    setPasswordError(null);
    setSiteError(null);
    setUsernameError(null);

    if (!site) {
      setSiteError("Site is required");
      setLoading(false);
      return;
    }

    if (!username) {
      setUsernameError("Username is required");
      setLoading(false);
      return;
    }

    if (!password || password.length < 1) {
      setPasswordError("Password is required");
      setLoading(false);
      return;
    }

    try {
      const encryptedData = await encryptPassword(
        password,
        idToken,
        shareWithUsers.map(user => user.value),
        shareWithGroups.map(group => group.value)
      );

      let passwordPayload;
      if (typeof encryptedData === 'string') {
        try {
          passwordPayload = JSON.parse(encryptedData);
        } catch (parseError) {
          console.error('Failed to parse encrypted data:', parseError);
          passwordPayload = encryptedData;
        }
      } else {
        passwordPayload = encryptedData;
      }

      const response = await fetch(
        `${process.env.REACT_APP_API_GATEWAY_ENDPOINT}create_secret`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            site,
            username,
            password: passwordPayload,
            encrypted: true,
            subdirectory,
            notes,
            tags: tags.map(tag => tag.value),
            sharedWith: {
              users: shareWithUsers.map(user => user.value),
              groups: shareWithGroups.map(group => group.value),
              roles: groupRoles
            },
            favorite: false,
            version: 1
          }),
        }
      );

      if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
      setSuccess(true);
      setSite("");
      setUsername("");
      setPassword("");
      setSubdirectory("");
      setNotes("");
      setTags([]);
      setShareWithUsers([]);
      setShareWithGroups([]);
      setGroupRoles({});
      setShowSharingOptions(false);
      if (onSecretCreated) onSecretCreated();
    } catch (err) {
      console.error("Submit error:", err);
      setError(err.message || "Failed to create secret");
    } finally {
      setLoading(false);
    }
  };

  const filterUsers = (query) => {
    if (!query.trim()) {
      setFilteredAvailableUsers(availableUsers);
      return;
    }
    
    const lowercasedQuery = query.toLowerCase().trim();
    const filtered = availableUsers.filter(user => 
      user.label.toLowerCase().includes(lowercasedQuery) ||
      (user.email && user.email.toLowerCase().includes(lowercasedQuery)) || 
      (user.given_name && user.given_name.toLowerCase().includes(lowercasedQuery)) || 
      (user.family_name && user.family_name.toLowerCase().includes(lowercasedQuery)) 
    );
    
    setFilteredAvailableUsers(filtered);
  };

  const handleUserFilterChange = (e) => {
    const query = e.target.value;
    setUserFilter(query);
    filterUsers(query);
  };

  useEffect(() => {
    setFilteredAvailableUsers(availableUsers);
  }, [availableUsers]);

  return (
    <div className="create-secret-form card p-4">
      <h4 className="card-title mb-3">Create New Secret</h4>

      {encryptionWarning && (
        <div className="alert alert-warning" role="alert">
          Your browser doesn't support secure encryption. Passwords will be sent with basic protection only.
        </div>
      )}

      {success && (
        <div className="alert alert-success success-message" role="alert">
          Secret created successfully!
        </div>
      )}

      {error && (
        <div className="alert alert-danger" role="alert">
          Error creating secret: {error}
        </div>
      )}

      <form autoComplete="off" onSubmit={handleSubmit} className="d-flex flex-column gap-3">
        <div className="row">
          <div className="col-md-7">
            <div className="mb-3">
              <label htmlFor="site" className="form-label">Site:</label>
              <input
                type="text"
                id="site"
                value={site}
                onChange={(e) => {
                  setSite(e.target.value);
                  setSiteError(null);
                }}
                placeholder="example.com"
                className="form-control"
                maxLength={MAX_SITE_LENGTH}
              />
              {siteError && (
                <div className="invalid-feedback create-invalid-feedback d-block" role="alert">
                  {siteError}
                </div>
              )}
            </div>

            <div className="mb-3">
              <label htmlFor="username" className="form-label">Username:</label>
              <input
               autoComplete="off"
                type="text"
                id="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setUsernameError(null);
                }}
                placeholder="your_username"
                className="form-control"
                maxLength={MAX_USERNAME_LENGTH}
              />
              {usernameError && (
                <div className="invalid-feedback create-invalid-feedback d-block" role="alert">
                  {usernameError}
                </div>
              )}
            </div>

            <div className="mb-3">
              <label htmlFor="password" className="form-label">Password:</label>
              <div className="password-input d-flex gap-2">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError(null);
                  }}
                  placeholder="Enter password"
                  autoComplete="new-password"
                  className="form-control"
                  maxLength={MIN_PASSWORD_LENGTH}
                />
                <button
                  type="button"
                  className="btn view-button"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
                </button>
                <button
                  type="button"
                  className="btn generate-password"
                  onClick={generatePassword}
                >
                  <FontAwesomeIcon icon={faShuffle} />
                </button>
              </div>
              {passwordError && (
                <div className="invalid-feedback create-invalid-feedback d-block" role="alert">
                  {passwordError}
                </div>
              )}
            </div>
          </div>

          <div className="col-md-5">
          <div className="mb-3">
          <button
            type="button"
            className={`btn sharing-toggle ${showSharingOptions ? "hide" : "show"}`}
            onClick={() => setShowSharingOptions(!showSharingOptions)}
          >
            <FontAwesomeIcon icon={faUsers} className="me-2" />
            {showSharingOptions ? "Hide Sharing Options" : "Show Sharing Options"}
          </button>        
          {showSharingOptions && (
          <div className="sharing-options mb-3">
            <h5 className="mb-2">Share with Users:</h5>
          
            <Select
              isMulti
              name="users"
              options={filteredAvailableUsers}
              className="basic-multi-select"
              classNamePrefix="select"
              value={shareWithUsers}
              onChange={(selected) => setShareWithUsers(selected || [])}
              placeholder="Select or type name/email"
              noOptionsMessage={() => 
                userFilter 
                  ? "No users available" 
                  : "No users available"
              }
              isLoading={loading}
              isDisabled={loading || !!error}
            />
            <h5 className="mt-3 mb-2">Share with Groups:</h5>
            <Select
              isMulti
              name="groups"
              options={availableGroups}
              className="basic-multi-select"
              classNamePrefix="select"
              value={shareWithGroups}
              onChange={(selected) => {
                setShareWithGroups(selected || []);
                const newRoles = { ...groupRoles };
                selected.forEach(group => {
                  if (!newRoles[group.value]) newRoles[group.value] = "viewer";
                });
                setGroupRoles(newRoles);
              }}
              placeholder="Select or type group"
            />
            {shareWithGroups.length > 0 && (
              <div className="mt-3">
                {shareWithGroups.map(group => (
                  <div key={group.value} className="permission-row d-flex align-items-center mb-2">
                    <label className="me-2">"{group.label}" Members' Role:</label>
                    <Select
                      options={[
                        { value: "viewer", label: "Viewer" },
                        { value: "editor", label: "Editor" }
                      ]}
                      className="basic-select role-select"
                      classNamePrefix="select"
                      value={{ 
                        value: groupRoles[group.value] || "viewer", 
                        label: (groupRoles[group.value] || "viewer") === "viewer" ? "Viewer" : "Editor" 
                      }}
                      onChange={(selected) => setGroupRoles({ 
                        ...groupRoles, 
                        [group.value]: selected.value 
                      })}
                      placeholder="Select role"
                      isSearchable={false}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </div> 
            <div className="mb-3">
              <label htmlFor="subdirectory" className="form-label">Subdirectory (optional):</label>
              <input
                type="text"
                id="subdirectory"
                maxLength="50"
                value={subdirectory}
                onChange={(e) => setSubdirectory(e.target.value)}
                placeholder="e.g., project1"
                className="form-control"
              />
            </div>

            <div className="mb-3">
              <label htmlFor="tags" className="form-label">Tags (optional):</label>
              <CreatableSelect
                isMulti
                name="tags"
                className="basic-multi-select"
                classNamePrefix="select"
                value={tags}
                onChange={setTags}
                placeholder="Add tags (e.g., work, personal)"
              />
            </div>              
          </div>
        </div> 

        <div className="mb-3">
          <label htmlFor="notes" className="form-label">Additional Notes (optional):</label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any additional notes here"
            rows="3"
            className="form-control"
            maxLength={MAX_SUBDIRECTORY_LENGTH}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Creating..." : "Create Secret"}
        </button>
      </form>
    </div>
  );
}

export default CreateSecretForm;