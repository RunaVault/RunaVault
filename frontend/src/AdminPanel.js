import React, { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserPlus, faUsers, faTimes, faEdit, faTrash } from '@fortawesome/free-solid-svg-icons';
import Select from 'react-select';
import "./App.css";

function AdminPanel({ accessToken, onClose, onSessionUpdate }) {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newUserGroups, setNewUserGroups] = useState([]);
  const [recentlyCreatedUserEmail, setRecentlyCreatedUserEmail] = useState(null);
  const [activeTab, setActiveTab] = useState("users"); 
  const [activeUserTab, setActiveUserTab] = useState("create"); 
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [editUser, setEditUser] = useState(null);
  const [deleteUserConfirm, setDeleteUserConfirm] = useState(null);
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState(null);
  const [groupNameError, setGroupNameError] = useState(null);
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [emailError, setEmailError] = useState(null);
  const [currentUserEmail, setCurrentUserEmail] = useState(null);
  const [userGroups, setUserGroups] = useState({}); 
  const [givenNameError, setGivenNameError] = useState(null);
  const [familyNameError, setFamilyNameError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupSearchQuery, setGroupSearchQuery] = useState("");

  const cache = React.useRef({});

  const fetchUserGroups = useCallback(async (username) => {
    if (cache.current[username]) return cache.current[username];

    try {
      const response = await fetch(`${process.env.REACT_APP_API_GATEWAY_ENDPOINT}list_user_groups`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username }),
      });
      if (!response.ok) throw new Error("Failed to fetch user groups");
      const data = await response.json();
      cache.current[username] = data.groups;
      return data.groups;
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, [accessToken]);

  const fetchAllUserGroups = useCallback(async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_GATEWAY_ENDPOINT}list_user_groups`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ listAllUsers: true }),
      });
      if (!response.ok) throw new Error("Failed to fetch users and groups");
      const data = await response.json();
      
      data.users.forEach(user => {
        cache.current[user.username] = user.groups;
      });
      
      const userGroupsMap = {};
      data.users.forEach(user => {
        userGroupsMap[user.username] = user.groups;
      });
      
      return userGroupsMap;
    } catch (err) {
      setError(err.message);
      return {};
    }
  }, [accessToken]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const tokenParts = accessToken.split('.');
        if (tokenParts.length === 3) {
          const payload = JSON.parse(atob(tokenParts[1]));
          setCurrentUserEmail(payload.email);
        }

        const allUsersGroups = await fetchAllUserGroups();
        setUserGroups(allUsersGroups);

        const usersResponse = await fetch(`${process.env.REACT_APP_API_GATEWAY_ENDPOINT}list_users`, {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!usersResponse.ok) throw new Error("Failed to fetch users");
        const usersData = await usersResponse.json();
        setUsers(usersData.users);

        const groupsResponse = await fetch(`${process.env.REACT_APP_API_GATEWAY_ENDPOINT}list_groups`, {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!groupsResponse.ok) throw new Error("Failed to fetch groups");
        const groupsData = await groupsResponse.json();
        setGroups(groupsData.groups);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [accessToken, fetchAllUserGroups]);

  const validateEmail = (email) => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!email) {
      setEmailError("Email is required");
      return false;
    } else if (!emailRegex.test(email)) {
      setEmailError("Please enter a valid email using only Latin letters");
      return false;
    } else {
      setEmailError(null);
      return true;
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    
    if (!validateEmail(newEmail)) {
      return;
    }

    if (!givenName) {
      setGivenNameError("First name is required");
      return;
    }

    if (!/^[a-zA-Z\s]+$/.test(givenName)) {
      setGivenNameError("First name can only contain Latin letters");
      return;
    }

    if (!familyName) {
      setFamilyNameError("Last name is required");
      return;
    }

    if (!/^[a-zA-Z\s]+$/.test(familyName)) {
      setFamilyNameError("Last name can only contain Latin letters");
      return;
    }
    
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`${process.env.REACT_APP_API_GATEWAY_ENDPOINT}create_user`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail,
          given_name: givenName,
          family_name: familyName
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        if (data.message === "User account already exists") {
          setError("User already exists");
        } else {
          setError(data.message || "Failed to create user");
        }
        return;
      }
      
      setSuccess("User created successfully!");
      setRecentlyCreatedUserEmail(newEmail);
      setNewEmail("");
      const usersResponse = await fetch(`${process.env.REACT_APP_API_GATEWAY_ENDPOINT}list_users`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const usersData = await usersResponse.json();
      
      const newUser = usersData.users.find(user => user.label === newEmail);
      if (newUser) {
        setUserGroups(prevGroups => ({
          ...prevGroups,
          [newUser.value]: []
        }));
      }
      
      setUsers(usersData.users);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailChange = (e) => {
    const email = e.target.value;
    setNewEmail(email);
    if (emailError) {
      setEmailError(null);
    }
  };

  const handleGivenNameChange = (e) => {
    const name = e.target.value;
    setGivenName(name);
    if (givenNameError) {
      setGivenNameError(null);
    }
  };

  const handleFamilyNameChange = (e) => {
    const name = e.target.value;
    setFamilyName(name);
    if (familyNameError) {
      setFamilyNameError(null);
    }
  };

  const handleAddNewUserToGroups = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`${process.env.REACT_APP_API_GATEWAY_ENDPOINT}add_user_to_groups`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ username: recentlyCreatedUserEmail, groups: newUserGroups.map(g => g.value) }),
      });
      if (!response.ok) throw new Error("Failed to add user to groups");
      
      const data = await response.json();
      if (data.requiresSessionUpdate && onSessionUpdate) {
        await onSessionUpdate();
      }
      
      const updatedGroups = userGroups[recentlyCreatedUserEmail] || [];
      const newGroups = newUserGroups.map(g => g.value);
      
      setUserGroups(prevGroups => ({
        ...prevGroups,
        [recentlyCreatedUserEmail]: [...new Set([...updatedGroups, ...newGroups])]
      }));
      
      setSuccess("User added to groups successfully!");
      setRecentlyCreatedUserEmail(null);
      setNewUserGroups([]);
      setGivenName("");
      setFamilyName("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  const handleGroupNameChange = (e) => {
    const name = e.target.value;
    setNewGroupName(name);
    if (groupNameError) {
      setGroupNameError(null);
    }
  };

  const validateGroupName = (name) => {
    if (!name) return "Group name is required";
    if (name.length < 3) return "Group name must be at least 3 characters long";
    if (name.length > 128) return "Group name must not exceed 128 characters";
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return "Group name can only contain letters, numbers, underscores and hyphens";
    }
    if (groups.some(group => group.value.toLowerCase() === name.toLowerCase())) {
      return "Group with this name already exists";
    }
    return null;
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    const validationError = validateGroupName(newGroupName);
    if (validationError) {
      setGroupNameError(validationError);
      setLoading(false);
      return;
    }
    
    try {
      const response = await fetch(`${process.env.REACT_APP_API_GATEWAY_ENDPOINT}create_group`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ groupName: newGroupName }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to create group");
      }

      setSuccess("Group created successfully!");
      setNewGroupName("");
      setGroupNameError(null);
      
      const groupsResponse = await fetch(`${process.env.REACT_APP_API_GATEWAY_ENDPOINT}list_groups`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const groupsData = await groupsResponse.json();
      setGroups(groupsData.groups);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (editUser.newUsername) {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(editUser.newUsername)) {
        setEditUser({ ...editUser, emailError: "Please enter a valid email using only Latin letters" });
        setLoading(false);
        return;
      }
    }

    if (editUser.given_name && !/^[a-zA-Z\s]+$/.test(editUser.given_name)) {
      setEditUser({ ...editUser, givenNameError: "First name can only contain Latin letters" });
      setLoading(false);
      return;
    }

    if (editUser.family_name && !/^[a-zA-Z\s]+$/.test(editUser.family_name)) {
      setEditUser({ ...editUser, familyNameError: "Last name can only contain Latin letters" });
      setLoading(false);
      return;
    }
    
    try {
      const userAttributesProvided = editUser.newUsername || editUser.given_name || 
                                   editUser.family_name || editUser.resetPassword;
      
      if (userAttributesProvided) {
        const updateResponse = await fetch(`${process.env.REACT_APP_API_GATEWAY_ENDPOINT}edit_users`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ 
            username: editUser.value, 
            editUser: true,
            newUsername: editUser.newUsername || undefined,
            given_name: editUser.given_name || undefined,
            family_name: editUser.family_name || undefined,
            password: editUser.resetPassword ? "reset" : undefined
          }),
        });
        if (!updateResponse.ok) throw new Error("Failed to update user attributes");
      }
      
      let needsSessionUpdate = false;
      let updatedUserGroups = [...(userGroups[editUser.value] || [])];
      
      if (editUser.groupsToAdd.length > 0) {
        const addResponse = await fetch(`${process.env.REACT_APP_API_GATEWAY_ENDPOINT}add_user_to_groups`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ username: editUser.value, groups: editUser.groupsToAdd.map(g => g.value) }),
        });
        if (!addResponse.ok) throw new Error("Failed to add user to groups");
        
        const addData = await addResponse.json();
        if (addData.requiresSessionUpdate) {
          needsSessionUpdate = true;
        }
        
        const newGroups = editUser.groupsToAdd.map(g => g.value);
        updatedUserGroups = [...new Set([...updatedUserGroups, ...newGroups])];
      }
      
      if (editUser.groupsToRemove.length > 0) {
        const removeResponse = await fetch(`${process.env.REACT_APP_API_GATEWAY_ENDPOINT}remove_user_from_groups`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ username: editUser.value, groups: editUser.groupsToRemove.map(g => g.value) }),
        });
        if (!removeResponse.ok) throw new Error("Failed to remove user from groups");
        
        const removeData = await removeResponse.json();
        if (removeData.requiresSessionUpdate) {
          needsSessionUpdate = true;
        }
        
        const removeGroups = editUser.groupsToRemove.map(g => g.value);
        updatedUserGroups = updatedUserGroups.filter(g => !removeGroups.includes(g));
      }
      
      setUserGroups(prevGroups => ({
        ...prevGroups,
        [editUser.value]: updatedUserGroups
      }));
      
      if (needsSessionUpdate && onSessionUpdate) {
        await onSessionUpdate();
      }
      
      setSuccess("User updated successfully!");
      setEditUser(null);
      const usersResponse = await fetch(`${process.env.REACT_APP_API_GATEWAY_ENDPOINT}list_users`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const usersData = await usersResponse.json();
      setUsers(usersData.users);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`${process.env.REACT_APP_API_GATEWAY_ENDPOINT}edit_users`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ username: deleteUserConfirm.value, deleteUser: true }),
      });
      if (!response.ok) throw new Error("Failed to delete user");
      
      setUserGroups(prevGroups => {
        const newGroups = { ...prevGroups };
        delete newGroups[deleteUserConfirm.value];
        return newGroups;
      });
      
      setSuccess("User deleted successfully!");
      setDeleteUserConfirm(null);
      const usersResponse = await fetch(`${process.env.REACT_APP_API_GATEWAY_ENDPOINT}list_users`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const usersData = await usersResponse.json();
      setUsers(usersData.users);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`${process.env.REACT_APP_API_GATEWAY_ENDPOINT}delete_group`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ groupName: deleteGroupConfirm.value }),
      });
      if (!response.ok) throw new Error("Failed to delete group");
      setSuccess("Group deleted successfully!");
      setDeleteGroupConfirm(null);
      const groupsResponse = await fetch(`${process.env.REACT_APP_API_GATEWAY_ENDPOINT}list_groups`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const groupsData = await groupsResponse.json();
      setGroups(groupsData.groups);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openEditUser = async (user) => {
    setLoading(true);
    const currentGroups = await fetchUserGroups(user.value);
    
    const userData = users.find(u => u.value === user.value);
    
    setEditUser({ 
      ...user, 
      currentGroups, 
      groupsToAdd: [], 
      groupsToRemove: [],
      newUsername: "",
      given_name: userData.given_name || "",
      family_name: userData.family_name || "",
      resetPassword: false
    });
    setLoading(false);
  };

  const isAdmin = (user) => {
    return userGroups[user.value] && userGroups[user.value].some(group => group.value === "Admin");
  };

  useEffect(() => {
    const usersWithoutGroups = users.filter(user => !userGroups.hasOwnProperty(user.value));
    
    if (usersWithoutGroups.length > 0) {
      (async () => {
        try {
          const usernames = usersWithoutGroups.map(user => user.value);
          const newUserGroups = await fetchAllUserGroups();
          
          setUserGroups(prevGroups => ({
            ...prevGroups,
            ...newUserGroups
          }));
        } catch (err) {
          console.error('Failed to fetch groups for new users:', err);
        }
      })();
    }
  }, [users, userGroups, fetchAllUserGroups]);

  return (
    <div className="admin-panel-overlay d-flex justify-content-center align-items-center">
      <div className="admin-panel-container p-4">
        <div className="admin-panel-header d-flex justify-content-between align-items-center mb-3">
          <h3 className="mb-0">Admin Panel</h3>
          <button onClick={onClose} className="btn close-button">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        {error && <div className="alert alert-danger">{error}</div>}
        {success && <div className="alert alert-success success-message">{success}</div>}

        {/* Основні вкладки */}
        <ul className="nav nav-tabs mb-3">
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === "users" ? "active" : ""}`}
              onClick={() => {
                setActiveTab("users");
                setSuccess(null);
              }}
            >
              Users
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === "groups" ? "active" : ""}`}
              onClick={() => {
                setActiveTab("groups");
                setSuccess(null);
              }}
            >
              Groups
            </button>
          </li>
        </ul>

        {activeTab === "users" && (
          <div className="row">
            {/* Вкладки для Users */}
            <div className="col-md-5">
                <h4 className="mb-3">
                  <FontAwesomeIcon icon={faUserPlus} className="me-2" /> Create User
                </h4>
                {!recentlyCreatedUserEmail && (
                  <form onSubmit={handleCreateUser} className="d-flex flex-column gap-3">
                  <input
                    type="text"
                    value={newEmail}
                    onChange={handleEmailChange}
                    placeholder="Email"
                    className={`form-control ${emailError ? "is-invalid" : ""}`}
                  />
                  {emailError && (
                    <div className="invalid-feedback d-block" role="alert">
                      {emailError}
                    </div>
                  )}
                  <input
                    type="text"
                    value={givenName}
                    onChange={handleGivenNameChange}
                    placeholder="First name"
                    className={`form-control ${givenNameError ? "is-invalid" : ""}`}
                  />
                  {givenNameError && (
                    <div className="invalid-feedback d-block" role="alert">
                      {givenNameError}
                    </div>
                  )}
                  <input
                    type="text"
                    value={familyName}
                    onChange={handleFamilyNameChange}
                    placeholder="Last name"
                    className={`form-control ${familyNameError ? "is-invalid" : ""}`}
                  />
                  {familyNameError && (
                    <div className="invalid-feedback d-block" role="alert">
                      {familyNameError}
                    </div>
                  )}
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    Create
                  </button>
                </form>
              )}  
                 {recentlyCreatedUserEmail && (
                  <div className="new-user-groups mt-3">
                    <h5>Add <span className="new-user-span">{givenName}</span> <span className="new-user-span">{familyName}</span> to&nbsp;Groups</h5>
                    <form onSubmit={handleAddNewUserToGroups} className="d-flex flex-column gap-3">
                      <Select
                        isMulti
                        options={groups}
                        value={newUserGroups}
                        onChange={setNewUserGroups}
                        placeholder="Select groups"
                        isDisabled={loading}
                      />
                      <div className="d-flex justify-content-between">
                        <button
                          type="submit"
                          className="btn btn-primary"
                          disabled={loading || newUserGroups.length === 0}
                        >
                          Add to Groups
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            setRecentlyCreatedUserEmail(null);
                            setGivenName("");
                            setFamilyName("");
                          }}
                        >
                          Skip
                        </button>
                      </div>
                    </form>
                  </div>
                )}  
          </div>
          <div className="col-md-7">
                <div className="user-list-container">
                  <div className="user-list-header">
                    <h4>User List</h4>
                    <div className="search-container">
                      <input
                        type="text"
                        placeholder="Search users..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="form-control search-input-users"
                      />
                    </div>
                  </div>
                  {loading && <div className="text-center text-muted fs-5">Loading...</div>}
                  <div className="user-list">
                    {users
                      .filter(user => 
                        user.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        user.given_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        user.family_name?.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .map((user) => (
                        <div
                          key={user.value}
                          className="user-item d-flex justify-content-between align-items-center p-2 border-bottom"
                        >
                          <span>{user.label}</span>
                          <div className="d-flex gap-2">
                            <button
                              className="btn icon-button edit-button"
                              onClick={() => openEditUser(user)}
                            >
                              <FontAwesomeIcon icon={faEdit} />
                            </button>
                            <button
                              className="btn icon-button delete-button"
                              onClick={() => setDeleteUserConfirm(user)}
                              disabled={isAdmin(user)}
                              title={isAdmin(user) ? "The administrator cannot be removed." : ""}
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
            </div>
   
          </div>
        )}

        {activeTab === "groups" && (
          <div className="row">
            <div className="col-md-5">
              <h4 className="mb-3">
                <FontAwesomeIcon icon={faUsers} className="me-2" /> Create Group
              </h4>
              <form onSubmit={handleCreateGroup} className="d-flex flex-column gap-3">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={handleGroupNameChange}
                  placeholder="Group name"
                  className={`form-control ${groupNameError ? "is-invalid" : ""}`}
                />
                {groupNameError && (
                  <div className="invalid-feedback d-block" role="alert">
                    {groupNameError}
                  </div>
                )}
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || groupNameError}
                >
                  Create
                </button>
              </form>
            </div>
            <div className="col-md-7">
              <div className="mb-4">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h4>Group List</h4>
                  <div className="search-container">
                    <input
                      type="text"
                      className="form-control search-input"
                      placeholder="Search groups..."
                      value={groupSearchQuery}
                      onChange={(e) => setGroupSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="user-list">
                  {groups
                    .filter(group => 
                      String(group.label || group).toLowerCase().includes(groupSearchQuery.toLowerCase())
                    )
                    .map((group) => (
                      <div key={group.value || group} className="user-item d-flex justify-content-between align-items-center p-2 border-bottom">
                        <span>{group.label || group}</span>
                        <div>
                          <button
                            className="btn icon-button delete-button"
                            onClick={() => setDeleteGroupConfirm(group)}
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {editUser && (
          <div className="modal-overlay">
            <div className="modal edit-modal">
              <h4 className="mb-3">Edit User: <span class="edit-user-label">{editUser.label}</span></h4>
              <form onSubmit={handleEditUser} className="d-flex flex-column gap-3">
                <div className="row">
                <div class="col-md-6">
                <div className="user-attributes">
                  <h5>User Information</h5>
                  <input
                    type="email"
                    value={editUser.newUsername}
                    onChange={(e) => setEditUser({ ...editUser, newUsername: e.target.value })}
                    placeholder="New email/username"
                    className="form-control mb-2"
                    hidden
                  />
                  <input
                    type="text"
                    value={editUser.given_name}
                    onChange={(e) => setEditUser({ ...editUser, given_name: e.target.value, givenNameError: null })}
                    placeholder="First name"
                    className={`form-control mb-2 ${editUser.givenNameError ? "is-invalid" : ""}`}
                  />
                  {editUser.givenNameError && (
                    <div className="invalid-feedback edit-invalid-feedback">{editUser.givenNameError}</div>
                  )}
                  <input
                    type="text"
                    value={editUser.family_name}
                    onChange={(e) => setEditUser({ ...editUser, family_name: e.target.value, familyNameError: null })}
                    placeholder="Last name"
                    className={`form-control mb-2 ${editUser.familyNameError ? "is-invalid" : ""}`}
                  />
                  {editUser.familyNameError && (
                    <div className="invalid-feedback edit-invalid-feedback">{editUser.familyNameError}</div>
                  )}
                  <div className="form-check mb-3">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="resetPassword"
                      checked={editUser.resetPassword}
                      onChange={(e) => setEditUser({ ...editUser, resetPassword: e.target.checked })}
                    />
                    <label className="form-check-label" htmlFor="resetPassword">
                    Reset password
                    </label>
                  </div>
                </div>
                </div>
                <div class="col-md-6">
                <div className="current-groups">
                  <h5>Group Management</h5>
                  <strong>Current Groups:</strong>
                  {editUser.currentGroups.length > 0 ? (
                    <div className="list-unstyled groups-list mt-2">
                      {editUser.currentGroups.map(group => (
                        <span key={group.value}>{group.label}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted mt-2">No groups assigned</p>
                  )}
                </div>
                <Select
                  isMulti
                  options={groups.filter(g => !editUser.currentGroups.some(cg => cg.value === g.value))}
                  value={editUser.groupsToAdd}
                  onChange={(selected) => setEditUser({ ...editUser, groupsToAdd: selected || [] })}
                  placeholder="Add to groups"
                  isDisabled={loading}
                />
                <Select
                  isMulti
                  options={editUser.currentGroups}
                  value={editUser.groupsToRemove}
                  onChange={(selected) => setEditUser({ ...editUser, groupsToRemove: selected || [] })}
                  placeholder="Remove from groups"
                  isDisabled={loading}
                />
                
                </div>
                </div>
                <div className="d-flex justify-content-between">
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => {
                      setEditUser(null);
                      setSuccess(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-success save" disabled={loading}>
                    Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {deleteUserConfirm && (
          <div className="modal-overlay d-flex justify-content-center align-items-center">
            <div className="modal modal-delete p-4 text-center">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M9.17218 14.8284L12.0006 12M14.829 9.17157L12.0006 12M12.0006 12L9.17218 9.17157M12.0006 12L14.829 14.8284" stroke="#e53935" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path> <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#e53935" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path> </g></svg>
              <h4 className="mb-3">Are you sure?</h4>
                <p>This process cannot be undone.</p>
              <div className="d-flex justify-content-around gap-3">
                <button 
                  className="btn btn-secondary" 
                  onClick={() => {
                    setDeleteUserConfirm(null);
                    setSuccess(null);
                  }}
                >
                  Cancel
                </button>
                <button className="btn btn-danger delete-confirm" onClick={handleDeleteUser} disabled={loading}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteGroupConfirm && (
          <div className="modal-overlay d-flex justify-content-center align-items-center">
            <div className="modal modal-delete p-4 text-center">   
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M9.17218 14.8284L12.0006 12M14.829 9.17157L12.0006 12M12.0006 12L9.17218 9.17157M12.0006 12L14.829 14.8284" stroke="#e53935" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path> <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#e53935" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path> </g></svg>
              <h4 className="mb-3">Are you sure?</h4>
              <p>This process cannot be undone.</p>
              <div className="d-flex justify-content-around gap-3">
                <button 
                  className="btn btn-secondary" 
                  onClick={() => {
                    setDeleteGroupConfirm(null);
                    setSuccess(null);
                  }}
                >
                  Cancel
                </button>
                <button className="btn btn-danger delete-confirm" onClick={handleDeleteGroup} disabled={loading}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div >
  );
}

export default AdminPanel;