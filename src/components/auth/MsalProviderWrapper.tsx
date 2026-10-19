'use client';

import React, { useEffect, useState } from 'react';
import { MsalProvider } from '@azure/msal-react';
import {
  type IPublicClientApplication,
  PublicClientApplication,
} from '@azure/msal-browser';
import { msalConfig } from '@/lib/auth/msal_config';

interface MsalProviderWrapperProps {
  children: React.ReactNode;
}

let sharedPca: IPublicClientApplication | null = null;

function getSharedPca(): IPublicClientApplication | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (!sharedPca) {
    sharedPca = new PublicClientApplication(msalConfig);
  }
  return sharedPca;
}

/**
 * Root MSAL provider wrapper ensuring MSAL authentication context is available client-side.
 */
export function MsalProviderWrapper({ children }: MsalProviderWrapperProps) {
  const [initializedPca, setInitializedPca] = useState<IPublicClientApplication | null>(null);

  useEffect(() => {
    let isMounted = true;
    const client = getSharedPca();

    if (!client) {
      return;
    }

    client
      .initialize()
      .then(() => client.handleRedirectPromise())
      .then(() => {
        if (!isMounted) return;
        const accounts = client.getAllAccounts();
        if (accounts.length > 0 && !client.getActiveAccount()) {
          client.setActiveAccount(accounts[0]);
        }
        setInitializedPca(client);
      })
      .catch((err) => {
        console.warn('MSAL initialization deferred or failed:', err);
        if (isMounted) {
          setInitializedPca(client);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!initializedPca) {
    return <>{children}</>;
  }

  return <MsalProvider instance={initializedPca}>{children}</MsalProvider>;
}
