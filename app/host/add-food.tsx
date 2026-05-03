import { Redirect } from 'expo-router';
import React from 'react';

/** Legacy path — host tools live under the main tab stack. */
export default function HostAddFoodLegacyRedirect() {
  return <Redirect href="/(tabs)/host" />;
}
