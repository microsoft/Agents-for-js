/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export async function acquireToken(settings) {
  const msalInstance = new msal.PublicClientApplication({
    auth: {
      clientId: settings.appClientId,
      authority: `https://login.microsoftonline.com/${settings.tenantId}`,
    },
  });

  await msalInstance.initialize();
  const loginRequest = {
    scopes: ["https://api.powerplatform.com/.default"],
    redirectUri: window.location.origin,
  };

  const accounts = await msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    const response = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account: accounts[0],
    });
    return response.accessToken;
  }

  const response = await msalInstance.loginPopup(loginRequest);
  return response.accessToken;
}