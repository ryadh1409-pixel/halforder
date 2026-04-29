import React from 'react';
import { PlatformPayButton as NativePlatformPayButton } from '@stripe/stripe-react-native';

type Props = React.ComponentProps<typeof NativePlatformPayButton>;

export default function PlatformPayButton(props: Props) {
  return <NativePlatformPayButton {...props} />;
}
