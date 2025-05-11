import React, { createContext, useContext, useState, useCallback } from 'react';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [users, setUsers] = useState([]);
  const [secrets, setSecrets] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState({ users: 0, secrets: 0 });

  const fetchUsers = useCallback(async (accessToken) => {
    const now = Date.now();
    if (users.length > 0 && (now - lastFetchTime.users) < 300000) {
      return users;
    }
    
    try {
      setIsLoading(true);
      const response = await fetch(`${process.env.REACT_APP_API_GATEWAY_ENDPOINT}list_users`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error("Failed to fetch users");
      const data = await response.json();
      setUsers(data.users);
      setLastFetchTime(prev => ({ ...prev, users: now }));
      return data.users;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [users, lastFetchTime.users]);

  const fetchSecrets = useCallback(async (accessToken) => {
    const now = Date.now();
    if (secrets !== null && (now - lastFetchTime.secrets) < 300000) {
      return secrets;
    }
    
    try {
      setIsLoading(true);
      const response = await fetch(`${process.env.REACT_APP_API_GATEWAY_ENDPOINT}list_secrets`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error("Failed to fetch secrets");
      const data = await response.json();
      setSecrets(data);
      setLastFetchTime(prev => ({ ...prev, secrets: now }));
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [secrets, lastFetchTime.secrets]);

  const updateSecrets = useCallback((newSecrets) => {
    setSecrets(newSecrets);
    setLastFetchTime(prev => ({ ...prev, secrets: Date.now() }));
  }, []);

  const resetState = useCallback(() => {
    setUsers([]);
    setSecrets(null);
    setError(null);
    setLastFetchTime({ users: 0, secrets: 0 });
  }, []);

  return (
    <AppContext.Provider value={{
      users,
      secrets,
      isLoading,
      error,
      fetchUsers,
      fetchSecrets,
      updateSecrets,
      resetState
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}; 