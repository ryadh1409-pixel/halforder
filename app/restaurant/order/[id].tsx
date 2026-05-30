import { HOST_ROUTES } from '@/lib/navigationPaths';
import { Redirect } from 'expo-router';
import React from 'react';

/** Legacy restaurant order path → host dashboard (orders tab removed). */
export default function LegacyRestaurantOrderRedirect() {
  return <Redirect href={HOST_ROUTES.dashboard} />;
}
