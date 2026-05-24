import { Redirect } from 'expo-router';
import React from 'react';

export default function RestaurantIndexRedirect() {
  return <Redirect href="/(host)/dashboard" />;
}
