import React from 'react';

type Props = {
  children: React.ReactNode;
};

export default function StripeProviderWrapper({ children }: Props) {
  return <>{children}</>;
}
