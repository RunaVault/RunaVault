import React, { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faEye, faEyeSlash, faTrash, faEdit, faFolder, faFolderOpen, faUsers,
  faStar as faStarSolid, faSync, faShareAlt, faChevronLeft, faChevronRight, faInfoCircle
} from '@fortawesome/free-solid-svg-icons';
import { faStar as faStarRegular } from '@fortawesome/free-regular-svg-icons';
import { encryptPassword, decryptPassword } from "./CryptoUtils";
import CreatableSelect from 'react-select/creatable';
import Select from 'react-select';
import "./App.css";
import { useAppContext } from './AppContext';

function SecretsTab({ accessToken, idToken, group, mode, secretsData, onUpdateSecretsData }) {
  const { users, fetchUsers, secrets, fetchSecrets, updateSecrets } = useAppContext();
  const [secretsCache, setSecretsCache] = useState({});
  const [filteredSecrets, setFilteredSecrets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [expandedDirs, setExpandedDirs] = useState({});
  const [copyNotification, setCopyNotification] = useState(null);
  const [editSecret, setEditSecret] = useState(null);
  const [editSite, setEditSite] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editSubdirectory, setEditSubdirectory] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editTags, setEditTags] = useState([]);
  const [editShareWithUsers, setEditShareWithUsers] = useState([]);
  const [editShareWithGroups, setEditShareWithGroups] = useState([]);
  const [editGroupRoles, setEditGroupRoles] = useState({});
  const [availableUsers, setAvailableUsers] = useState([]);
  const [availableGroups, setAvailableGroups] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showSharingOptions, setShowSharingOptions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [isSharingOptionsLoaded, setIsSharingOptionsLoaded] = useState(false);
  const [shareDirectory, setShareDirectory] = useState(null);
  const [shareDirUsers, setShareDirUsers] = useState([]);
  const [shareDirGroups, setShareDirGroups] = useState([]);
  const [shareDirGroupRoles, setShareDirGroupRoles] = useState({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [directoryPages, setDirectoryPages] = useState({});
  const [itemsPerPage] = useState(50);
  const [userFilter, setUserFilter] = useState("");
  const [filteredAvailableUsers, setFilteredAvailableUsers] = useState([]);
  const [sortField, setSortField] = useState("favorite");
  const [sortDirection, setSortDirection] = useState("desc");
  const [pendingFetch, setPendingFetch] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState(null);

  useEffect(() => {
    if (!idToken) {
      setSecretsCache({});
      setFilteredSecrets([]);
      setVisiblePasswords({});
      setExpandedDirs({});
      setCopyNotification(null);
      setEditSecret(null);
      setEditSite("");
      setEditUsername("");
      setEditPassword("");
      setEditSubdirectory("");
      setEditNotes("");
      setEditTags([]);
      setEditShareWithUsers([]);
      setEditShareWithGroups([]);
      setEditGroupRoles({});
      setAvailableUsers([]);
      setAvailableGroups([]);
    }
  }, [idToken]);

  const parseSite = (site, subdirectory) => {
    const parts = site.split('#');
    const baseSite = parts[0];
    const dir = subdirectory || (parts[1] && parts[1] !== parts[parts.length - 1] ? parts[1] : "");
    return { baseSite, displaySubdirectory: dir };
  };

  const handleSearchChange = (e) => {
    setError(null);
    setSearchQuery(e.target.value);
  };

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

  const getUserIdFromToken = (idToken) => {
    if (!idToken) return null;
    try {
      const payload = JSON.parse(atob(idToken.split('.')[1]));
      return payload.sub;
    } catch (error) {
      console.error('Error decoding ID token:', error);
      return null;
    }
  };

  const fetchSecretsData = useCallback(async (forceRefresh = false) => {
    const cacheKey = mode === "sharedWithMe" ? "sharedWithMe" : group ? `group_${group}` : "mySecrets";
    const cachedData = secretsCache[cacheKey];

    if (!forceRefresh && cachedData !== undefined) {
      setFilteredSecrets(cachedData);
      setLoading(false);
      return;
    }

    if (pendingFetch && !forceRefresh) {
      return;
    }
    
    setPendingFetch(true);
    setLoading(true);
    setError(null);
    try {
      let data;
      if (!forceRefresh && secretsData) {
        data = secretsData;
      } else {
        data = await fetchSecrets(accessToken);
        
        if (onUpdateSecretsData) {
          onUpdateSecretsData(data);
        }
      }

      const allSecrets = data.secrets || [];

      const parsedSecrets = allSecrets.map(secret => {
        let parsedPassword;
        if (typeof secret.password === 'string') {
          try {
            parsedPassword = JSON.parse(secret.password);
          } catch (e) {
            console.error(`Failed to parse password string for ${secret.site}:`, e);
            parsedPassword = { encryptedPassword: secret.password, sharedWith: { users: [], groups: [] } };
          }
        } else if (typeof secret.password === 'object' && secret.password !== null) {
          parsedPassword = {
            ...secret.password,
            sharedWith: {
              users: secret.password.sharedWith?.users || [],
              groups: secret.password.sharedWith?.groups || [],
              roles: secret.password.sharedWith?.roles || {}
            }
          };
        } else {
          console.error(`Invalid password format for ${secret.site}:`, secret.password);
          parsedPassword = { encryptedPassword: '', sharedWith: { users: [], groups: [], roles: {} } };
        }

        const shared_with = {
          users: secret.shared_with?.users || [],
          groups: secret.shared_with?.groups || [],
          roles: secret.shared_with?.roles || {}
        };

        const { baseSite, displaySubdirectory } = parseSite(secret.site, secret.subdirectory);

        return {
          ...secret,
          parsedPassword,
          shared_with,
          baseSite, 
          displaySubdirectory
        };
      });

      let filteredSecrets;
      const userId = getUserIdFromToken(idToken);

      if (mode === "sharedWithMe") {
        filteredSecrets = parsedSecrets.filter(secret => {
          const isSharedWithUser = secret.shared_with?.users?.includes(userId);
          const notOwnedByMe = !secret.owned_by_me;
          return isSharedWithUser && notOwnedByMe;
        });
      } else if (group) {
        filteredSecrets = parsedSecrets.filter(secret =>
          secret.shared_with?.groups?.includes(group)
        );
      } else {
        filteredSecrets = parsedSecrets.filter(secret =>
          secret.owned_by_me
        );
      }

      const sortedSecrets = filteredSecrets.sort((a, b) => (b.favorite || 0) - (a.favorite || 0));
      setSecretsCache(prev => ({ ...prev, [cacheKey]: sortedSecrets }));
      setFilteredSecrets(sortedSecrets);
    } catch (err) {
      setError(err.message);
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
      setPendingFetch(false);
    }
  }, [accessToken, group, mode, secretsCache, idToken, secretsData, onUpdateSecretsData, pendingFetch, fetchSecrets]);

  const populateSharingOptions = useCallback(async () => {
    if (isSharingOptionsLoaded) return;
    try {
      if (users.length > 0) {
        let currentUserId = null;
        if (idToken) {
          try {
            const payload = JSON.parse(atob(idToken.split('.')[1]));
            currentUserId = payload.sub;
          } catch (error) {
            console.error('Error decoding ID token:', error);
          }
        }
        
        const filteredUsers = users.filter(user => user.value !== currentUserId);
        setAvailableUsers(filteredUsers);
        setFilteredAvailableUsers(filteredUsers);
        setIsSharingOptionsLoaded(true);
        return;
      }

      const availableUsers = await fetchUsers(accessToken);
      
      let currentUserId = null;
      if (idToken) {
        try {
          const payload = JSON.parse(atob(idToken.split('.')[1]));
          currentUserId = payload.sub;
        } catch (error) {
          console.error('Error decoding ID token:', error);
        }
      }
      
      const filteredUsers = availableUsers.filter(user => user.value !== currentUserId);
      
      setAvailableUsers(filteredUsers);
      setFilteredAvailableUsers(filteredUsers);
      setIsSharingOptionsLoaded(true);
    } catch (err) {
      console.error("Error fetching users:", err);
      setError("Failed to load user list");
    }
  }, [accessToken, idToken, isSharingOptionsLoaded, fetchUsers, users]);

  useEffect(() => {
    if (idToken) {
      const groups = getUserGroupsFromToken(idToken);
      const groupOptions = groups.map(group => ({ value: group, label: group }));
      setAvailableGroups(groupOptions);
    }
  }, [idToken]);

  useEffect(() => {
    const cacheKey = mode === "sharedWithMe" ? "sharedWithMe" : group ? `group_${group}` : "mySecrets";
    
    if (secretsData && secretsCache[cacheKey] === undefined) {
      const data = secretsData;
      const allSecrets = data.secrets || [];

      const parsedSecrets = allSecrets.map(secret => {
        let parsedPassword;
        if (typeof secret.password === 'string') {
          try {
            parsedPassword = JSON.parse(secret.password);
          } catch (e) {
            console.error(`Failed to parse password string for ${secret.site}:`, e);
            parsedPassword = { encryptedPassword: secret.password, sharedWith: { users: [], groups: [] } };
          }
        } else if (typeof secret.password === 'object' && secret.password !== null) {
          parsedPassword = {
            ...secret.password,
            sharedWith: {
              users: secret.password.sharedWith?.users || [],
              groups: secret.password.sharedWith?.groups || [],
              roles: secret.password.sharedWith?.roles || {}
            }
          };
        } else {
          console.error(`Invalid password format for ${secret.site}:`, secret.password);
          parsedPassword = { encryptedPassword: '', sharedWith: { users: [], groups: [], roles: {} } };
        }

        const shared_with = {
          users: secret.shared_with?.users || [],
          groups: secret.shared_with?.groups || [],
          roles: secret.shared_with?.roles || {}
        };

        const { baseSite, displaySubdirectory } = parseSite(secret.site, secret.subdirectory);

        return {
          ...secret,
          parsedPassword,
          shared_with,
          baseSite, 
          displaySubdirectory
        };
      });

      let filteredSecrets;
      const userId = getUserIdFromToken(idToken);

      if (mode === "sharedWithMe") {
        filteredSecrets = parsedSecrets.filter(secret => {
          const isSharedWithUser = secret.shared_with?.users?.includes(userId);
          const notOwnedByMe = !secret.owned_by_me;
          return isSharedWithUser && notOwnedByMe;
        });
      } else if (group) {
        filteredSecrets = parsedSecrets.filter(secret =>
          secret.shared_with?.groups?.includes(group)
        );
      } else {
        filteredSecrets = parsedSecrets.filter(secret =>
          secret.owned_by_me
        );
      }

      const sortedSecrets = filteredSecrets.sort((a, b) => (b.favorite || 0) - (a.favorite || 0));
      setSecretsCache(prev => ({ ...prev, [cacheKey]: sortedSecrets }));
      setFilteredSecrets(sortedSecrets);
      setLoading(false);
    } else if (secretsCache[cacheKey] === undefined && !pendingFetch) {
      fetchSecretsData();
    } else {
      setFilteredSecrets(secretsCache[cacheKey] || []);
    }
  }, [accessToken, group, mode, fetchSecretsData, secretsCache, idToken, secretsData, pendingFetch]);

  useEffect(() => {
    if (!isSharingOptionsLoaded && accessToken) {
      populateSharingOptions();
    }
  }, [isSharingOptionsLoaded, accessToken, populateSharingOptions]);

  const handleRefresh = () => {
    setError(null);
    fetchSecretsData(true);
    populateSharingOptions();
  };

  const calculatePagination = useCallback((secrets) => {
    const totalPages = Math.ceil(secrets.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
    return {
      totalPages,
      currentItems: secrets.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
    };
  }, [currentPage, itemsPerPage]);

  const getPaginatedSecrets = useCallback((secrets) => {
    return secrets.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [currentPage, itemsPerPage]);

  const changePage = (pageNumber) => {
    setError(null);
    setCurrentPage(pageNumber);
  };

  const sortSecrets = (secrets, field, direction) => {
    return [...secrets].sort((a, b) => {
      if (field === "favorite") {
        return direction === "desc" ? (b.favorite || 0) - (a.favorite || 0) : (a.favorite || 0) - (b.favorite || 0);
      } 
      else if (field === "site") {
        return direction === "desc" 
          ? b.baseSite.toLowerCase().localeCompare(a.baseSite.toLowerCase()) 
          : a.baseSite.toLowerCase().localeCompare(b.baseSite.toLowerCase());
      } 
      else if (field === "username") {
        return direction === "desc" 
          ? b.username.toLowerCase().localeCompare(a.username.toLowerCase()) 
          : a.username.toLowerCase().localeCompare(b.username.toLowerCase());
      } 
      else if (field === "date") {
        const dateA = a.last_modified ? new Date(a.last_modified).getTime() : 0;
        const dateB = b.last_modified ? new Date(b.last_modified).getTime() : 0;
        return direction === "desc" ? dateB - dateA : dateA - dateB;
      }
      return 0;
    });
  };

  const handleSort = (field) => {
    setError(null);
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "date" ? "desc" : "asc");
    }
  };

  const renderSortIcon = (field) => {
    if (sortField !== field) return null;
    return (
      <span className="sort-icon ms-1">
        {sortDirection === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  useEffect(() => {
    const cacheKey = mode === "sharedWithMe" ? "sharedWithMe" : group ? `group_${group}` : "mySecrets";
    const cachedSecrets = secretsCache[cacheKey] || [];
    
    const sorted = sortSecrets([...cachedSecrets], sortField, sortDirection);
    setFilteredSecrets(sorted);
  }, [sortField, sortDirection]);

  const applyFilters = useCallback(() => {
    const cacheKey = mode === "sharedWithMe" ? "sharedWithMe" : group ? `group_${group}` : "mySecrets";
    const cachedSecrets = secretsCache[cacheKey] || [];
    let filtered = [...cachedSecrets];

    if (showFavoritesOnly && mode !== "sharedWithMe" && !group) {
      filtered = filtered.filter(secret => secret.favorite);
    }
    if (searchQuery) {
      filtered = filtered.filter(secret =>
        secret.baseSite.toLowerCase().includes(searchQuery.toLowerCase()) ||
        secret.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (secret.notes && secret.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (secret.tags && secret.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())))
      );
    }
    
    const sortedFiltered = sortSecrets(filtered, sortField, sortDirection);
    setFilteredSecrets(sortedFiltered);
    setCurrentPage(1);
  }, [secretsCache, group, mode, showFavoritesOnly, searchQuery, sortField, sortDirection]);

  useEffect(() => {
    applyFilters();
  }, [showFavoritesOnly, searchQuery, applyFilters]);

  const handleViewPassword = async (secret, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    setError(null);
    const secretId = `${secret.user_id}-${secret.site}-${secret.displaySubdirectory || ''}`;
    if (visiblePasswords[secretId]) {
      setVisiblePasswords(prev => ({ ...prev, [secretId]: false }));
      return;
    }

    let encryptedData = secret.parsedPassword.encryptedPassword;
    let encryptionContext = { purpose: "password-manager" };
    const userId = getUserIdFromToken(idToken);
    const isOwner = secret.user_id === userId;

    if (!isOwner) {
      if (group && secret.parsedPassword.sharedWith?.groups?.length > 0) {
        const groupMatch = secret.parsedPassword.sharedWith.groups.find(g => g.groupId === group);
        if (groupMatch) {
          encryptedData = groupMatch.encryptedPassword;
          encryptionContext = { groupId: group, purpose: "password-manager" };
        }
      } else if (secret.parsedPassword.sharedWith?.users?.length > 0) {
        const userMatch = secret.parsedPassword.sharedWith.users.find(u => u.userId === userId);
        if (userMatch) {
          encryptedData = userMatch.encryptedPassword;
          encryptionContext = { userId: userId, purpose: "password-manager" };
        }
      }
    }

    if (!encryptedData) {
      setError("No encrypted password available for this context");
      return;
    }

    const password = await decryptPassword(encryptedData, idToken, encryptionContext);
    if (password) {
      setVisiblePasswords(prev => ({ ...prev, [secretId]: password }));
    }
  };

  const handleCopy = async (field, secret, e) => {
    setError(null);
    e.preventDefault();
    e.stopPropagation();
    let textToCopy;
    const secretId = `${secret.user_id}-${secret.site}-${secret.displaySubdirectory || ''}`;

    if (field === "site") {
      textToCopy = secret.baseSite;
    } else if (field === "username") {
      textToCopy = secret.username;
    } else {
      let encryptedData = secret.parsedPassword.encryptedPassword;
      let encryptionContext = { purpose: "password-manager" };
      const userId = getUserIdFromToken(idToken);
      const isOwner = secret.user_id === userId;

      if (!isOwner) {
        if (group && secret.parsedPassword.sharedWith?.groups?.length > 0) {
          const groupMatch = secret.parsedPassword.sharedWith.groups.find(g => g.groupId === group);
          if (groupMatch) {
            encryptedData = groupMatch.encryptedPassword;
            encryptionContext = { groupId: group, purpose: "password-manager" };
          }
        } else if (secret.parsedPassword.sharedWith?.users?.length > 0) {
          const userMatch = secret.parsedPassword.sharedWith.users.find(u => u.userId === userId);
          if (userMatch) {
            encryptedData = userMatch.encryptedPassword;
            encryptionContext = { userId: userId, purpose: "password-manager" };
          }
        }
      }

      if (!encryptedData) {
        setError("No encrypted password available for this context");
        return;
      }

      try {
        textToCopy = await decryptPassword(encryptedData, idToken, encryptionContext);
      } catch (err) {
        console.error("Decryption failed:", err);
        setError("Failed to decrypt password: " + (err.message || "Invalid ciphertext"));
        return;
      }
    }

    if (!textToCopy) return;

    try {
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      textarea.style.position = 'fixed';
      textarea.style.opacity = 0;
      document.body.appendChild(textarea);
      
      textarea.select();
      
      try {
        await navigator.clipboard.writeText(textToCopy);
      } catch (err) {
        document.execCommand('copy');
      }
      
      document.body.removeChild(textarea);
      
      setCopyNotification({ field, site: secretId });
      setTimeout(() => setCopyNotification(null), 2500);
    } catch (err) {
      console.error("Failed to copy:", err);
      setError("Failed to copy to clipboard");
    }
  };

  const handleDelete = async (secret, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    setError(null);
    const userId = getUserIdFromToken(idToken);
    
    if (secret.user_id !== userId) {
      setError("You can only delete your own secrets.");
      return;
    }
    setDeleteConfirmation(secret);
  };

  const confirmDelete = async () => {
    setError(null);
    const secret = deleteConfirmation;
    setIsDeleting(true);
    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_GATEWAY_ENDPOINT}delete_secret`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: secret.user_id,
            site: secret.site, 
            subdirectory: secret.displaySubdirectory || ""
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to delete secret");

      const cacheKey = mode === "sharedWithMe" ? "sharedWithMe" : group ? `group_${group}` : "mySecrets";
      setSecretsCache(prev => ({
        ...prev,
        [cacheKey]: prev[cacheKey].filter(s =>
          s.site !== secret.site || s.user_id !== secret.user_id || s.displaySubdirectory !== secret.displaySubdirectory
        ),
      }));
      setFilteredSecrets(prev => prev.filter(s =>
        s.site !== secret.site || s.user_id !== secret.user_id || s.displaySubdirectory !== secret.displaySubdirectory
      ));
      setDeleteConfirmation(null);
    } catch (err) {
      setError(err.message);
      console.error("Delete error:", err);
      setDeleteConfirmation(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setError(null);
    setDeleteConfirmation(null);
  };

  const handleEdit = async (secret, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    setError(null);
    const userId = getUserIdFromToken(idToken);
    
    const userRole = group ? secret.shared_with?.roles?.[group] || "viewer" : "owner";
    if (secret.user_id !== userId && userRole !== "editor") {
      setError("You can only edit your own secrets or those where you're an editor.");
      return;
    }

    if (!isSharingOptionsLoaded) {
      await populateSharingOptions();
    }

    const sharedUsers = secret.shared_with.users
      .map(userId => {
        const user = availableUsers.find(u => u.value === userId);
        return user ? { value: user.value, label: user.label } : null;
      })
      .filter(Boolean);

    const sharedGroups = secret.shared_with.groups
      .map(group => ({ value: group, label: group }))
      .filter(group => availableGroups.some(g => g.value === group.value));

    setEditSecret(secret);
    setEditSite(secret.baseSite); 
    setEditUsername(secret.username);
    setEditPassword("");
    setEditSubdirectory(secret.displaySubdirectory || "");
    setEditNotes(secret.notes || "");
    setEditTags(secret.tags ? secret.tags.map(tag => ({ value: tag, label: tag })) : []);
    setEditShareWithUsers(sharedUsers);
    setEditShareWithGroups(sharedGroups);
    setEditGroupRoles(secret.shared_with.roles || {});
  };

  const toggleFavorite = async (secret, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    setError(null);
    const userId = getUserIdFromToken(idToken);
    
    if (secret.user_id !== userId) {
      setError("You can only favorite your own secrets.");
      return;
    }
    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_GATEWAY_ENDPOINT}edit_secret`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            site: secret.site, 
            subdirectory: secret.displaySubdirectory || "",
            favorite: !secret.favorite,
          }),
        }
      );
      if (!response.ok) throw new Error("Failed to toggle favorite");

      const updatedSecret = await response.json();
      const cacheKey = mode === "sharedWithMe" ? "sharedWithMe" : group ? `group_${group}` : "mySecrets";

      setSecretsCache(prev => ({
        ...prev,
        [cacheKey]: prev[cacheKey].map(s =>
          s.user_id === secret.user_id && s.site === secret.site && s.displaySubdirectory === secret.displaySubdirectory
            ? { ...s, favorite: updatedSecret.secret.favorite }
            : s
        ),
      }));

      setFilteredSecrets(prev => prev.map(s =>
        s.user_id === secret.user_id && s.site === secret.site && s.displaySubdirectory === secret.displaySubdirectory
          ? { ...s, favorite: updatedSecret.secret.favorite }
          : s
      ).sort((a, b) => (b.favorite || 0) - (a.favorite || 0)));
    } catch (err) {
      setError(err.message);
      console.error("Favorite toggle error:", err);
    }
  };

  const cancelEdit = () => {
    setEditSecret(null);
    setEditSite("");
    setEditUsername("");
    setEditPassword("");
    setEditSubdirectory("");
    setEditNotes("");
    setEditTags([]);
    setEditShareWithUsers([]);
    setEditShareWithGroups([]);
    setEditGroupRoles({});
    setShowPassword(false);
    setShowSharingOptions(false);
  };

  const updateExpandedDirectories = (newSubdirectory) => {
    if (newSubdirectory && newSubdirectory !== "default") {
      setExpandedDirs(prev => ({
        ...prev,
        [newSubdirectory]: true
      }));
    }
  };

  const submitEdit = async () => {
    setError(null);
    if (!editSecret) return;
    try {
      let encryptedData = null;
      if (editPassword) {
        encryptedData = await encryptPassword(
          editPassword,
          idToken,
          editShareWithUsers.map(user => user.value),
          editShareWithGroups.map(group => group.value)
        );
      }

      const isSubdirectoryChanged = editSubdirectory !== editSecret.displaySubdirectory && 
                                    editSubdirectory !== editSecret.subdirectory;

      const response = await fetch(
        `${process.env.REACT_APP_API_GATEWAY_ENDPOINT}edit_secret`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: editSecret.user_id,
            site: editSecret.site, 
            username: editUsername,
            password: encryptedData,
            encrypted: !!encryptedData,
            subdirectory: editSubdirectory,
            notes: editNotes,
            tags: editTags.map(tag => tag.value),
            sharedWith: {
              users: editShareWithUsers.map(user => user.value),
              groups: editShareWithGroups.map(group => group.value),
              roles: editGroupRoles
            },
            favorite: editSecret.favorite
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to edit secret");
      }

      const updatedSecret = (await response.json()).secret;
      const { baseSite, displaySubdirectory } = parseSite(updatedSecret.site, updatedSecret.subdirectory);
      const cacheKey = mode === "sharedWithMe" ? "sharedWithMe" : group ? `group_${group}` : "mySecrets";

      if (isSubdirectoryChanged) {
        setSecretsCache(prev => {
          const updatedCache = {
            ...prev,
            [cacheKey]: prev[cacheKey].filter(s => 
              !(s.user_id === editSecret.user_id && 
                s.site === editSecret.site && 
                s.displaySubdirectory === editSecret.displaySubdirectory)
            )
          };
          
          updatedCache[cacheKey].push({
            ...editSecret,
            site: updatedSecret.site,
            baseSite,
            displaySubdirectory,
            username: updatedSecret.username,
            subdirectory: updatedSecret.subdirectory,
            notes: updatedSecret.notes,
            tags: updatedSecret.tags,
            last_modified: updatedSecret.last_modified,
            shared_with: updatedSecret.sharedWith,
            favorite: updatedSecret.favorite,
            parsedPassword: editPassword ? {
              ...editSecret.parsedPassword,
              encryptedPassword: encryptedData
            } : editSecret.parsedPassword
          });
          
          return updatedCache;
        });
        
        setFilteredSecrets(prev => {
          const updatedSecrets = prev.filter(s => 
            !(s.user_id === editSecret.user_id && 
              s.site === editSecret.site && 
              s.displaySubdirectory === editSecret.displaySubdirectory)
          );
          
          updatedSecrets.push({
            ...editSecret,
            site: updatedSecret.site,
            baseSite,
            displaySubdirectory,
            username: updatedSecret.username,
            subdirectory: updatedSecret.subdirectory,
            notes: updatedSecret.notes,
            tags: updatedSecret.tags,
            last_modified: updatedSecret.last_modified,
            shared_with: updatedSecret.sharedWith,
            favorite: updatedSecret.favorite
          });
          
          return updatedSecrets.sort((a, b) => (b.favorite || 0) - (a.favorite || 0));
        });
        
        updateExpandedDirectories(editSubdirectory);
      } else {
        setSecretsCache(prev => ({
          ...prev,
          [cacheKey]: prev[cacheKey].map(s =>
            s.user_id === editSecret.user_id && s.site === editSecret.site && s.displaySubdirectory === editSecret.displaySubdirectory
              ? {
                ...s,
                site: updatedSecret.site,
                baseSite,
                displaySubdirectory,
                username: updatedSecret.username,
                subdirectory: updatedSecret.subdirectory,
                notes: updatedSecret.notes,
                tags: updatedSecret.tags,
                last_modified: updatedSecret.last_modified,
                shared_with: updatedSecret.sharedWith,
                favorite: updatedSecret.favorite,
                parsedPassword: editPassword ? {
                  ...s.parsedPassword,
                  encryptedPassword: encryptedData
                } : s.parsedPassword
              }
              : s
          ),
        }));

        setFilteredSecrets(prev => prev.map(s =>
          s.user_id === editSecret.user_id && s.site === editSecret.site && s.displaySubdirectory === editSecret.displaySubdirectory
            ? {
              ...s,
              site: updatedSecret.site,
              baseSite,
              displaySubdirectory,
              username: updatedSecret.username,
              subdirectory: updatedSecret.subdirectory,
              notes: updatedSecret.notes,
              tags: updatedSecret.tags,
              last_modified: updatedSecret.last_modified,
              shared_with: updatedSecret.sharedWith,
              favorite: updatedSecret.favorite
            }
            : s
        ).sort((a, b) => (b.favorite || 0) - (a.favorite || 0)));
      }

      cancelEdit();
    } catch (err) {
      setError(err.message);
      console.error("Edit error:", err);
    }
  };

  const toggleDirectory = (dir) => {
    setError(null);
    setExpandedDirs(prev => {
      const isExpanding = !prev[dir];
      if (isExpanding) {
        setDirectoryPages(prevPages => ({ ...prevPages, [dir]: 1 }));
      }
      return { ...prev, [dir]: isExpanding };
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}.${month}.${year}, ${hours}:${minutes}`;
  };

  const generateRandomPassword = () => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 16; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    setEditPassword(password);
  };

  const handleShareDirectory = (dir) => {
    setError(null);
    setShareDirectory(dir);
    setShareDirUsers([]);
    setShareDirGroups([]);
    setShareDirGroupRoles({});
    if (!isSharingOptionsLoaded) {
      populateSharingOptions();
    }
  };

  const submitShareDirectory = async () => {
    setError(null);
    if (!shareDirectory) return;

    setLoading(true);
    try {
      console.log('Sharing directory:', shareDirectory);
      console.log('Share with:', {
        users: shareDirUsers.map(u => u.value),
        groups: shareDirGroups.map(g => g.value),
        roles: shareDirGroupRoles
      });
      
      const response = await fetch(
        `${process.env.REACT_APP_API_GATEWAY_ENDPOINT}share_directory`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subdirectory: shareDirectory,
            sharedWith: {
              users: shareDirUsers.map(u => u.value),
              groups: shareDirGroups.map(g => g.value),
              roles: shareDirGroupRoles
            }
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Share directory error response:', errorData);
        throw new Error(errorData.message || "Failed to share directory");
      }

      const data = await response.json();
      console.log('Share directory success response:', data);
      const updatedSecrets = data.secrets;
      const cacheKey = mode === "sharedWithMe" ? "sharedWithMe" : group ? `group_${group}` : "mySecrets";

      setSecretsCache(prev => {
        const updatedCache = {...prev};
        
        updatedCache[cacheKey] = prev[cacheKey].map(s => {
          const updatedSecret = updatedSecrets.find(us => 
            (us.site === s.site && us.subdirectory === s.subdirectory) ||
            (us.site === s.baseSite && us.subdirectory === s.subdirectory)
          );
          
          if (updatedSecret) {
            console.log('Updating cached secret:', s.baseSite, s.subdirectory);
            return {
              ...s,
              shared_with: updatedSecret.sharedWith,
              last_modified: updatedSecret.last_modified
            };
          }
          return s;
        });
        
        return updatedCache;
      });

      setFilteredSecrets(prev => {
        const updated = prev.map(s => {
          const updatedSecret = updatedSecrets.find(us => 
            (us.site === s.site && us.subdirectory === s.subdirectory) ||
            (us.site === s.baseSite && us.subdirectory === s.subdirectory)
          );
          
          if (updatedSecret) {
            console.log('Updating filtered secret:', s.baseSite, s.subdirectory);
            return {
              ...s,
              shared_with: updatedSecret.sharedWith,
              last_modified: updatedSecret.last_modified
            };
          }
          return s;
        });
        
        return updated.sort((a, b) => (b.favorite || 0) - (a.favorite || 0));
      });

      setShareDirectory(null);
    } catch (err) {
      setError(err.message);
      console.error("Share directory error:", err);
    } finally {
      setLoading(false);
    }
  };

  const cancelShareDirectory = () => {
    setError(null);
    setShareDirectory(null);
    setShareDirUsers([]);
    setShareDirGroups([]);
    setShareDirGroupRoles({});
  };

  const groupedSecrets = filteredSecrets.reduce((acc, secret) => {
    const dir = secret.displaySubdirectory || "default"; 
    if (!acc[dir]) acc[dir] = [];
    acc[dir].push(secret);
    return acc;
  }, {});

  const defaultSecrets = groupedSecrets["default"] || [];
  delete groupedSecrets["default"];

  const paginatedDefaultSecrets = getPaginatedSecrets(defaultSecrets);
  const paginationInfo = calculatePagination(defaultSecrets);

  const changeDirectoryPage = (dir, pageNumber) => {
    setError(null);
    setDirectoryPages(prev => ({ ...prev, [dir]: pageNumber }));
  };

  const Pagination = ({ totalPages, currentPage, onPageChange, totalItems }) => {
    if (totalPages <= 1) return null;
    const pageNumbers = [];
    const visiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(visiblePages / 2));
    let endPage = Math.min(totalPages, startPage + visiblePages - 1);
    if (endPage - startPage + 1 < visiblePages) {
      startPage = Math.max(1, endPage - visiblePages + 1);
    }
    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);
    return (
      <div className="d-flex flex-column align-items-center my-3">
        <div className="pagination-info text-muted mb-2">
          {startItem}-{endItem} of {totalItems} records
        </div>
        <ul className="pagination">
          <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
            <button
              className="page-link"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <FontAwesomeIcon icon={faChevronLeft} />
            </button>
          </li>
          {startPage > 1 && (
            <>
              <li className="page-item">
                <button className="page-link" onClick={() => onPageChange(1)}>1</button>
              </li>
              {startPage > 2 && (
                <li className="page-item disabled">
                  <span className="page-link">...</span>
                </li>
              )}
            </>
          )}
          {pageNumbers.map(number => (
            <li key={number} className={`page-item ${currentPage === number ? 'active' : ''}`}>
              <button className="page-link" onClick={() => onPageChange(number)}>
                {number}
              </button>
            </li>
          ))}
          {endPage < totalPages && (
            <>
              {endPage < totalPages - 1 && (
                <li className="page-item disabled">
                  <span className="page-link">...</span>
                </li>
              )}
              <li className="page-item">
                <button className="page-link" onClick={() => onPageChange(totalPages)}>
                  {totalPages}
                </button>
              </li>
            </>
          )}
          <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
            <button
              className="page-link"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <FontAwesomeIcon icon={faChevronRight} />
            </button>
          </li>
        </ul>
      </div>
    );
  };

  const filterUsers = useCallback((query) => {
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
  }, [availableUsers]);

  const handleUserFilterChange = (e) => {
    setError(null);
    const query = e.target.value;
    setUserFilter(query);
    filterUsers(query);
  };

  useEffect(() => {
    setFilteredAvailableUsers(availableUsers);
  }, [availableUsers]);

  return (
    <div className="secrets-section">
      <div className="search-bar d-flex gap-2 mb-3">
        {mode !== "sharedWithMe" && !group && (
          <button
            className="btn favorite-toggle"
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            title={showFavoritesOnly ? "Show All" : "Show Favorites Only"}
          >
            <FontAwesomeIcon icon={showFavoritesOnly ? faStarSolid : faStarRegular} />
          </button>
        )}
        <input
          type="text"
          value={searchQuery}
          autocomplete="off"
          onChange={handleSearchChange}
          placeholder="Search by site, username, tags or notes..."
          className="form-control search-input"
        />
        <button
          className="btn refresh-button"
          onClick={handleRefresh}
          title="Refresh secrets from server"
        >
          <FontAwesomeIcon icon={faSync} />
        </button>
      </div>

      {loading && <div className="text-center text-muted fs-5">Loading secrets...</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      {filteredSecrets.length === 0 ? (
        <p className="text-center text-muted">No secrets found</p>
      ) : (
        <div className="secrets-tree">
          {defaultSecrets.length > 0 && (
            <>
              <div className="secrets-table table-responsive">
                <table className="table table-bordered table-fixed">
                  <thead className="table-light">
                    <tr>
                      {mode !== "sharedWithMe" && !group && <th scope="col" className="fav-column"></th>}
                      <th scope="col" className="sortable-column" onClick={() => handleSort("site")}>
                        Site {renderSortIcon("site")}
                      </th>
                      <th scope="col" className="sortable-column" onClick={() => handleSort("username")}>
                        Username {renderSortIcon("username")}
                      </th>
                      <th scope="col">Password</th>
                      <th scope="col">Tags</th>
                      {(group || mode === "sharedWithMe") && <th scope="col">Shared By</th>}
                      <th scope="col" className="last-modified-column sortable-column" onClick={() => handleSort("date")}>
                        Last Modified {renderSortIcon("date")}
                      </th>
                      <th scope="col" className="actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedDefaultSecrets.map((secret) => {
                      const userId = getUserIdFromToken(idToken);
                      const isOwner = secret.user_id === userId;
                      const userRole = group ? secret.shared_with.roles?.[group] || "viewer" : "owner";

                      return (
                        <tr key={`${secret.user_id}-${secret.site}-${secret.displaySubdirectory}`}>
                          {mode !== "sharedWithMe" && !group && (
                            <td className="fav-column">
                              <button
                                className="btn favorite-button"
                                onClick={(e) => toggleFavorite(secret, e)}
                              >
                                <FontAwesomeIcon icon={secret.favorite ? faStarSolid : faStarRegular} />
                              </button>
                            </td>
                          )}
                          <td                            
                            className="clickable-cell"                            
                          >
                            <div className="cell-content position-relative"
                            onClick={(e) => handleCopy("site", secret, e)}
                            title={`${secret.baseSite}\nClick to copy`}
                            >
                              {secret.baseSite.replace(/^https?:\/\//, '')}
                            </div>
                            {copyNotification?.field === "site" && copyNotification?.site === `${secret.user_id}-${secret.site}-${secret.displaySubdirectory || ''}` && (
                              <span className="item-copy-notification">Copied!</span>
                            )}
                            {secret.notes && (
                                <div className="notes-tooltip-container"
                                onMouseEnter={(e) => {
                                      const tooltip = document.createElement('div');
                                      tooltip.className = 'notes-tooltip';
                                      tooltip.textContent = secret.notes;
                                      e.currentTarget.appendChild(tooltip);
                                    }}
                                    onMouseLeave={(e) => {
                                      const tooltip = e.currentTarget.querySelector('.notes-tooltip');
                                      if (tooltip) {
                                        tooltip.remove();
                                      }
                                    }}>
                                  <FontAwesomeIcon 
                                    icon={faInfoCircle} 
                                    className="notes-icon"
                                    
                                  />
                                </div>                             
                              )}
                          </td>
                          <td
                            onClick={(e) => handleCopy("username", secret, e)}
                            className="clickable-cell"
                            title={`${secret.username}\nClick to copy`}
                          >
                            <div className="cell-content position-relative">
                              {secret.username}
                            </div>
                            {copyNotification?.field === "username" && copyNotification?.site === `${secret.user_id}-${secret.site}-${secret.displaySubdirectory || ''}` && (
                              <span className="item-copy-notification">Copied!</span>
                            )}
                          </td>
                          <td>
                            <div
                              className="password-container position-relative clickable-cell"
                              onClick={(e) => handleCopy("password", secret, e)}
                              title="Click to copy"
                            >
                              {visiblePasswords[`${secret.user_id}-${secret.site}-${secret.displaySubdirectory || ''}`] ? (
                                <span className="password-text">{visiblePasswords[`${secret.user_id}-${secret.site}-${secret.displaySubdirectory || ''}`]}</span>
                              ) : (
                                <span className="spoiler">••••••••</span>
                              )}
                            </div>
                            {copyNotification?.field === "password" && copyNotification?.site === `${secret.user_id}-${secret.site}-${secret.displaySubdirectory || ''}` && (
                              <span className="item-copy-notification">Copied!</span>
                            )}
                          </td>
                          <td>
                            <div className="cell-content">
                              {secret.tags && secret.tags.length === 1 && secret.tags[0] === "NONE" ? "" : (secret.tags ? secret.tags.join(", ") : "N/A")}
                            </div>
                          </td>
                          {(group || mode === "sharedWithMe") && (
                            <td>
                              <div className="cell-content">
                                {isOwner ? "You" :
                                  availableUsers.find(user => user.value === secret.user_id)?.label || secret.user_id}
                              </div>
                            </td>
                          )}
                          <td className="last-modified-column">{formatDate(secret.last_modified)}</td>
                          <td className="actions-column">
                            <div className="d-flex gap-2 justify-content-center">
                              <button
                                className="btn view-button"
                                onClick={(e) => handleViewPassword(secret, e)}
                              >
                                <FontAwesomeIcon icon={visiblePasswords[`${secret.user_id}-${secret.site}-${secret.displaySubdirectory || ''}`] ? faEyeSlash : faEye} />
                              </button>
                              {(isOwner || userRole === "editor") && (
                                <>
                                  <button
                                    className="btn edit-button"
                                    onClick={(e) => handleEdit(secret, e)}
                                  >
                                    <FontAwesomeIcon icon={faEdit} />
                                  </button>
                                  {isOwner && (
                                    <button
                                      className="btn delete-button"
                                      onClick={(e) => handleDelete(secret, e)}
                                    >
                                      <FontAwesomeIcon icon={faTrash} />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination
                totalPages={paginationInfo.totalPages}
                currentPage={currentPage}
                onPageChange={changePage}
                totalItems={defaultSecrets.length}
              />
            </>
          )}

          {Object.entries(groupedSecrets).map(([dir, dirSecrets]) => {
            const currentDirPage = directoryPages[dir] || 1;
            const dirPaginationInfo = {
              totalPages: Math.ceil(dirSecrets.length / itemsPerPage),
              currentItems: dirSecrets.slice(
                (currentDirPage - 1) * itemsPerPage,
                currentDirPage * itemsPerPage
              )
            };

            return (
              <div key={dir} className="directory mb-3">
                <div className="directory-header p-2 d-flex justify-content-between align-items-center" onClick={() => toggleDirectory(dir)}>
                  <div className="d-flex align-items-center">
                    <FontAwesomeIcon
                      icon={expandedDirs[dir] ? faFolderOpen : faFolder}
                      className="folder-icon me-2"
                    />
                    <span>{dir} ({dirSecrets.length})</span>
                  </div>
                  {mode !== "sharedWithMe" && dirSecrets.some(secret => secret.user_id === getUserIdFromToken(idToken)) && (
                    <button
                      className="btn view-button share-directory-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShareDirectory(dir);
                      }}
                      title="Share Directory"
                    >
                      <FontAwesomeIcon icon={faShareAlt} />
                    </button>
                  )}
                </div>
                {expandedDirs[dir] && (
                  <>
                    <div className="secrets-table table-responsive mt-2">
                      <table className="table table-bordered table-fixed">
                        <thead className="table-light">
                          <tr>
                            {mode !== "sharedWithMe" && !group && <th scope="col" className="fav-column"></th>}
                            <th scope="col" className="sortable-column" onClick={() => handleSort("site")}>
                              Site {renderSortIcon("site")}
                            </th>
                            <th scope="col" className="sortable-column" onClick={() => handleSort("username")}>
                              Username {renderSortIcon("username")}
                            </th>
                            <th scope="col">Password</th>
                            <th scope="col">Tags</th>
                            {(group || mode === "sharedWithMe") && <th scope="col">Shared By</th>}
                            <th scope="col" className="last-modified-column sortable-column" onClick={() => handleSort("date")}>
                              Last Modified {renderSortIcon("date")}
                            </th>
                            <th scope="col" className="actions-column"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {dirPaginationInfo.currentItems.map(secret => {
                            const userId = getUserIdFromToken(idToken);
                            const isOwner = secret.user_id === userId;
                            const userRole = group ? secret.shared_with.roles?.[group] || "viewer" : "owner";

                            return (
                              <tr key={`${secret.user_id}-${secret.site}-${secret.displaySubdirectory}`}>
                                {mode !== "sharedWithMe" && !group && (
                                  <td className="fav-column">
                                    <button
                                      className="btn favorite-button"
                                      onClick={(e) => toggleFavorite(secret, e)}
                                    >
                                      <FontAwesomeIcon icon={secret.favorite ? faStarSolid : faStarRegular} />
                                    </button>
                                  </td>
                                )}
                                <td                                  
                                  className="clickable-cell"                                  
                                >
                                  <div className="cell-content position-relative"
                                  onClick={(e) => handleCopy("site", secret, e)}
                                  title={`${secret.baseSite}\nClick to copy`}
                                  >
                                    {secret.baseSite.replace(/^https?:\/\//, '')}
                                  </div>
                                  {copyNotification?.field === "site" && copyNotification?.site === `${secret.user_id}-${secret.site}-${secret.displaySubdirectory || ''}` && (
                                    <span className="item-copy-notification">Copied!</span>
                                  )}
                                  {secret.notes && (
                                <div className="notes-tooltip-container"
                                onMouseEnter={(e) => {
                                      const tooltip = document.createElement('div');
                                      tooltip.className = 'notes-tooltip';
                                      tooltip.textContent = secret.notes;
                                      e.currentTarget.appendChild(tooltip);
                                    }}
                                    onMouseLeave={(e) => {
                                      const tooltip = e.currentTarget.querySelector('.notes-tooltip');
                                      if (tooltip) {
                                        tooltip.remove();
                                      }
                                    }}>
                                  <FontAwesomeIcon 
                                    icon={faInfoCircle} 
                                    className="notes-icon"
                                    
                                  />
                                </div>                             
                              )}
                                </td>
                                <td
                                  onClick={(e) => handleCopy("username", secret, e)}
                                  className="clickable-cell"
                                  title={`${secret.username}\nClick to copy`}
                                >
                                  <div className="cell-content position-relative">
                                    {secret.username}
                                  </div>
                                  {copyNotification?.field === "username" && copyNotification?.site === `${secret.user_id}-${secret.site}-${secret.displaySubdirectory || ''}` && (
                                    <span className="item-copy-notification">Copied!</span>
                                  )}
                                </td>
                                <td>
                                  <div
                                    className="password-container position-relative clickable-cell"
                                    onClick={(e) => handleCopy("password", secret, e)}
                                    title="Click to copy"
                                  >
                                    {visiblePasswords[`${secret.user_id}-${secret.site}-${secret.displaySubdirectory || ''}`] ? (
                                      <span className="password-text">{visiblePasswords[`${secret.user_id}-${secret.site}-${secret.displaySubdirectory || ''}`]}</span>
                                    ) : (
                                      <span className="spoiler">••••••••</span>
                                    )}
                                  </div>
                                  {copyNotification?.field === "password" && copyNotification?.site === `${secret.user_id}-${secret.site}-${secret.displaySubdirectory || ''}` && (
                                    <span className="item-copy-notification">Copied!</span>
                                  )}
                                </td>
                                <td>
                                  <div className="cell-content">
                                    {secret.tags && secret.tags.length === 1 && secret.tags[0] === "NONE" ? "" : (secret.tags ? secret.tags.join(", ") : "N/A")}
                                  </div>
                                </td>
                                {(group || mode === "sharedWithMe") && (
                                  <td>
                                    <div className="cell-content">
                                      {isOwner ? "You" :
                                        availableUsers.find(user => user.value === secret.user_id)?.label || secret.user_id}
                                    </div>
                                  </td>
                                )}
                                <td className="last-modified-column">{formatDate(secret.last_modified)}</td>
                                <td className="actions-column">
                                  <div className="d-flex gap-2 justify-content-center">
                                    <button className="btn view-button" onClick={(e) => handleViewPassword(secret, e)}>
                                      <FontAwesomeIcon icon={visiblePasswords[`${secret.user_id}-${secret.site}-${secret.displaySubdirectory || ''}`] ? faEyeSlash : faEye} />
                                    </button>
                                    {(isOwner || userRole === "editor") && (
                                      <>
                                        <button className="btn edit-button" onClick={(e) => handleEdit(secret, e)}>
                                          <FontAwesomeIcon icon={faEdit} />
                                        </button>
                                        {isOwner && (
                                          <button className="btn delete-button" onClick={(e) => handleDelete(secret, e)}>
                                            <FontAwesomeIcon icon={faTrash} />
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <Pagination
                      totalPages={dirPaginationInfo.totalPages}
                      currentPage={currentDirPage}
                      onPageChange={(pageNumber) => changeDirectoryPage(dir, pageNumber)}
                      totalItems={dirSecrets.length}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {deleteConfirmation && (
        <div className="modal-overlay d-flex justify-content-center align-items-center">
          <div className="modal modal-delete p-4 text-center">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
              <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
              <g id="SVGRepo_iconCarrier">
                <path d="M9.17218 14.8284L12.0006 12M14.829 9.17157L12.0006 12M12.0006 12L9.17218 9.17157M12.0006 12L14.829 14.8284" stroke="#e53935" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#e53935" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
              </g>
            </svg>
            <h4 className="mb-3">Are you sure?</h4>
            <p>This process cannot be undone.</p>
            <div className="d-flex justify-content-around gap-3">
              <button className="btn btn-secondary cancel" onClick={cancelDelete} disabled={isDeleting}>
                Cancel
              </button>
              <button
                className="btn btn-danger delete-confirm"
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editSecret && (
        <div className="edit-overlay d-flex justify-content-center align-items-center">
          <div className="edit-dialog p-4">
            <h3 className="mb-3">Edit Secret</h3>
            <div className="row">
             <div className="col-md-7"> 
            <div className="mb-3">
              <label htmlFor="edit-site" className="form-label">Site:</label>
              <input
                type="text"
                id="edit-site"
                value={editSite}
                onChange={(e) => setEditSite(e.target.value)}
                placeholder="example.com"
                className="form-control readonly-input"
                readOnly
                maxLength="200"
              />
            </div>
            <div className="mb-3">
              <label htmlFor="edit-username" className="form-label">Username:</label>
              <input
                type="text"
                id="edit-username"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                placeholder="your_username"
                className="form-control"
                maxLength="100"
              />
            </div>
            <div className="mb-3">
              <label htmlFor="edit-password" className="form-label">Password (leave blank to keep current):</label>
              <div className="password-input d-flex gap-2">
                <input
                  type={showPassword ? "text" : "password"}
                  id="edit-password"
                  value={editPassword}
                  autocomplete="new-password"
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="form-control"
                  maxLength="50"
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
                  onClick={generateRandomPassword}
                  title="Generate Random Password"
                >
                  <FontAwesomeIcon icon={faSync} />
                </button>
              </div>
            </div>
            </div>
            <div className="col-md-5"> 
            {editSecret && (group ? editSecret.shared_with?.roles?.[group] || "viewer" : "owner") !== "editor" && (
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
                  name="edit-users"
                  options={filteredAvailableUsers}
                  className="basic-multi-select mb-3"
                  classNamePrefix="select"
                  value={editShareWithUsers}
                  onChange={(selected) => setEditShareWithUsers(selected || [])}
                  placeholder="Select or type name/email"
                  noOptionsMessage={() => userFilter ? "No users found" : "No users available"}
                  isLoading={loading}
                  isDisabled={loading || !!error}
                />
                <h5 className="mb-2">Share with Groups:</h5>
                <Select
                  isMulti
                  name="edit-groups"
                  options={availableGroups}
                  className="basic-multi-select mb-3"
                  classNamePrefix="select"
                  value={editShareWithGroups}
                  onChange={(selected) => {
                    setEditShareWithGroups(selected || []);
                    const newRoles = { ...editGroupRoles };
                    selected.forEach(group => {
                      if (!newRoles[group.value]) newRoles[group.value] = "viewer";
                    });
                    setEditGroupRoles(newRoles);
                  }}
                  placeholder="Select or type group"
                  noOptionsMessage={() => "No groups available"}
                />
                {editShareWithGroups.length > 0 && (
                  <div className="mb-3">
                    {editShareWithGroups.map(group => (
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
                            value: editGroupRoles[group.value] || "viewer",
                            label: (editGroupRoles[group.value] || "viewer") === "viewer" ? "Viewer" : "Editor"
                          }}
                          onChange={(selected) => setEditGroupRoles({
                            ...editGroupRoles,
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
          )}
           
            <div className="mb-3">
              <label htmlFor="edit-subdirectory" className="form-label">Subdirectory (optional):</label>
              <input
                type="text"
                maxlength="50"
                id="edit-subdirectory"
                value={editSubdirectory === "default" ? "" : editSubdirectory}
                onChange={(e) => setEditSubdirectory(e.target.value)}
                placeholder="e.g., project1"
                className="form-control"
              />
            </div>            
            <div className="mb-3">
              <label htmlFor="edit-tags" className="form-label">Tags (optional):</label>
              <CreatableSelect
                isMulti
                name="edit-tags"
                className="basic-multi-select"
                classNamePrefix="select"
                value={editTags}
                onChange={setEditTags}
                placeholder="Add tags (e.g., work, personal)"
              />
            </div>
            </div>
            </div>
            <div className="mb-3">
              <label htmlFor="edit-notes" className="form-label">Additional Notes:</label>
              <textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Add any additional notes here"
                rows="3"
                className="form-control"
                maxLength="500"
              />
            </div>
            <div className="d-flex justify-content-between gap-3">
              <button
                className="btn btn-secondary cancel flex-grow-1"
                onClick={cancelEdit}
              >
                Cancel
              </button>
              <button
                className="btn btn-success save flex-grow-1"
                onClick={submitEdit}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {shareDirectory && mode !== "sharedWithMe" && (
        <div className="edit-overlay d-flex justify-content-center align-items-center">
          <div className="edit-dialog edit-dialog-share p-4">
            <h3 className="mb-3 share-dir-name">Share Directory: {shareDirectory}</h3>
            <div className="mb-3">
              <label className="form-label">Share with Users</label>
              <Select
                isMulti
                name="share-dir-users"
                options={filteredAvailableUsers}
                className="basic-multi-select"
                classNamePrefix="select"
                value={shareDirUsers}
                onChange={(selected) => setShareDirUsers(selected || [])}
                placeholder="Select or type name/email"
                noOptionsMessage={() => userFilter ? "No users found" : "No users available"}
                isLoading={loading}
                isDisabled={loading || !!error}
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Share with Groups</label>
              <Select
                isMulti
                name="share-dir-groups"
                options={availableGroups}
                className="basic-multi-select dropdown-up"
                classNamePrefix="select"
                value={shareDirGroups}
                onChange={(selected) => {
                  setShareDirGroups(selected || []);
                  const newRoles = { ...shareDirGroupRoles };
                  selected.forEach(group => {
                    if (!newRoles[group.value]) newRoles[group.value] = "viewer";
                  });
                  setShareDirGroupRoles(newRoles);
                }}
                placeholder="Select or type group"
              />
            </div>
            {shareDirGroups.length > 0 && (
              <div className="mb-3">
                <h5 className="mb-2">Group Permissions</h5>
                {shareDirGroups.map(group => (
                  <div key={group.value} className="permission-row d-flex align-items-center mb-2">
                    <label className="me-2">{group.label} Role:</label>
                    <Select
                      options={[
                        { value: "viewer", label: "Viewer" },
                        { value: "editor", label: "Editor" }
                      ]}
                      className="basic-select role-select"
                      classNamePrefix="select"
                      value={{
                        value: shareDirGroupRoles[group.value] || "viewer",
                        label: (shareDirGroupRoles[group.value] || "viewer") === "viewer" ? "Viewer" : "Editor"
                      }}
                      onChange={(selected) => setShareDirGroupRoles({
                        ...shareDirGroupRoles,
                        [group.value]: selected.value
                      })}
                      placeholder="Select role"
                      isSearchable={false}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="d-flex justify-content-between gap-3">
              <button className="btn btn-secondary cancel flex-grow-1" onClick={cancelShareDirectory}>
                Cancel
              </button>
              <button className="btn btn-success save flex-grow-1" onClick={submitShareDirectory}>
                Share
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SecretsTab;