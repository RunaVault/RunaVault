import React, { useState } from "react";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSync } from '@fortawesome/free-solid-svg-icons';
import "./App.css";

function UserInfoTab({ user, onRefreshSession }) {
  const [showDangerArea, setShowDangerArea] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshSuccess, setRefreshSuccess] = useState(false);
  const [refreshError, setRefreshError] = useState(false);

  const getUserGroups = () => {
    if (!user?.id_token) return [];
    try {
      const payload = JSON.parse(atob(user.id_token.split('.')[1]));
      return payload['cognito:groups'] || [];
    } catch (error) {
      console.error('Error decoding ID token:', error);
      return [];
    }
  };

  const handleRefreshSession = async () => {
    setRefreshing(true);
    setRefreshSuccess(false);
    setRefreshError(false);
    try {
      if (onRefreshSession) {
        const success = await onRefreshSession();
        if (success) {
          setRefreshSuccess(true);
          setTimeout(() => setRefreshSuccess(false), 3000);
        } else {
          setRefreshError(true);
          setTimeout(() => setRefreshError(false), 3000);
        }
      }
    } catch (error) {
      console.error("Failed to refresh session:", error);
      setRefreshError(true);
      setTimeout(() => setRefreshError(false), 3000);
    } finally {
      setRefreshing(false);
    }
  };

  const groups = getUserGroups();

  return (
    <div className="user-details card p-4">
      <h3 className="card-title mb-3">User Information</h3>
      <p className="mb-2"><strong>Name:</strong> {user?.attributes?.given_name || "N/A"} {user?.attributes?.family_name || "N/A"}</p>
      <p className="mb-2"><strong>Email:</strong> {user?.attributes?.email || "N/A"}</p>
      <p className="mb-2"><strong>User ID (sub):</strong> {user?.attributes?.sub || "N/A"}</p>
      
      <div className="groups-section mt-3">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h4 className="mb-0">Groups</h4>
          <button 
            className="btn refresh-button"
            onClick={handleRefreshSession}
            disabled={refreshing}
            title="Refresh your groups information"
          >
            <FontAwesomeIcon icon={faSync} spin={refreshing} />
            {refreshSuccess && <span className="refresh-success ms-2">Updated!</span>}
            {refreshError && <span className="refresh-error ms-2">Failed to update!</span>}
          </button>
        </div>
        {groups.length > 0 ? (
          <ul className="list-group">
            {groups.map(group => (
              <li key={group} className="list-group-item">{group}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No groups assigned</p>
        )}
      </div>

      <div className="danger-area mt-4">
        <button 
          className={`btn ${showDangerArea ? "btn-danger" : "btn-warning"} mb-2`}
          onClick={() => setShowDangerArea(!showDangerArea)}
        >
          {showDangerArea ? "Hide Danger Area" : "Show Danger Area - Do Not Share"}
        </button>
        {showDangerArea && (
          <div className="spoiler-content">
            <p><strong>ID Token:</strong></p>
            <pre className="bg-light p-2 rounded">{user?.id_token || "N/A"}</pre>
            <p><strong>Access Token:</strong></p>
            <pre className="bg-light p-2 rounded">{user?.access_token || "N/A"}</pre>
            <p><strong>Refresh Token:</strong></p>
            <pre className="bg-light p-2 rounded">{user?.refresh_token || "N/A"}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default UserInfoTab;