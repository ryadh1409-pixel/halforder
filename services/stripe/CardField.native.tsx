import React from 'react';
import { CardField as StripeCardField } from '@stripe/stripe-react-native';

type CardFieldProps = React.ComponentProps<typeof StripeCardField>;

export default function CardField(props: CardFieldProps) {
  return <StripeCardField {...props} />;
}
