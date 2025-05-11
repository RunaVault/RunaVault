import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "react-oidc-context";
import { ThemeProvider } from "./ThemeContext";
import "./index.css";
import { library } from '@fortawesome/fontawesome-svg-core';
import { 
  faUser, faSignOutAlt, faUsersCog, faPlus, faMoon, faSun,
  faEye, faEyeSlash, faTrash, faEdit, faFolder, faFolderOpen, faUsers,
  faSync, faShareAlt, faChevronLeft, faChevronRight, faTimes
} from '@fortawesome/free-solid-svg-icons';
import { faStar as faStarRegular } from '@fortawesome/free-regular-svg-icons';

import { config } from '@fortawesome/fontawesome-svg-core';

config.autoAddCss = false;

library.add(
  faUser, faSignOutAlt, faUsersCog, faPlus, faMoon, faSun,
  faEye, faEyeSlash, faTrash, faEdit, faFolder, faFolderOpen, faUsers,
  faSync, faShareAlt, faChevronLeft, faChevronRight, faTimes,
  faStarRegular
); 

const cognitoAuthConfig = {
  authority: `https://cognito-idp.${process.env.REACT_APP_AWS_REGION}.amazonaws.com/${process.env.REACT_APP_COGNITO_ID}`,
  client_id: process.env.REACT_APP_COGNITO_CLIENT_ID,
  redirect_uri: process.env.REACT_APP_LOGIN_URI,
  response_type: "code",
  scope: "email openid profile",
  automaticSilentRenew: false,
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, window.location.pathname);
  },
  silent_redirect_uri: process.env.REACT_APP_LOGIN_URI,
};

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider {...cognitoAuthConfig}>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);